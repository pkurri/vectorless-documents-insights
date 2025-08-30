'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { X } from 'lucide-react';
import config from '../../config';
import ChunkedUploader from '../utils/chunkedUpload';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  progress?: {
    status: string;
    step: number;
    total: number;
    stepCost?: number;
    stepTime?: number;
  };
  metadata?: {
    selectedDocuments?: Array<{id: number, filename: string}>;
    relevantPagesCount?: number;
    timing?: {
      document_selection?: number;
      page_detection?: number;
      answer_generation?: number;
      total_time?: number;
    };
    costs?: {
      document_selection?: number;
      page_detection?: number;
      answer_generation?: number;
      total_cost?: number;
    };
    model?: string;
    provider?: string;
    hfModelId?: string;
  };
}

interface DocumentData {
  id: number;
  filename: string;
  pages: Array<{
    page_number: number;
    text: string;
  }>;
  total_pages: number;
}

interface StatelessChatSectionProps {
  documents: DocumentData[];
  description: string;
  onReset: () => void;
  onUpdateDocuments: (documents: DocumentData[]) => void;
  onUpdateDescription: (description: string) => void;
}

export default function StatelessChatSection({ 
  documents, 
  description, 
  onReset, 
  onUpdateDocuments, 
  onUpdateDescription 
}: StatelessChatSectionProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showDocuments, setShowDocuments] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>('gpt-5-mini');
  const [selectedProvider, setSelectedProvider] = useState<'openai' | 'huggingface'>('openai');
  const [hfModelId, setHfModelId] = useState<string>('');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState('');
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [selectedNewFiles, setSelectedNewFiles] = useState<File[]>([]);
  const [showUploadSection, setShowUploadSection] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [, setUploadProgress] = useState<{
    percentComplete: number;
    processedFiles: number;
    totalFiles: number;
    currentChunk: number;
    totalChunks: number;
    isChunked: boolean;
  } | null>(null);
  const [totalSessionCost, setTotalSessionCost] = useState<number>(0);
  const [selectedPageContent, setSelectedPageContent] = useState<{
    content: string;
    pageNumber: number;
    filename: string;
  } | null>(null);
  // Backend info (provider/model)
  const [backendInfo, setBackendInfo] = useState<{ provider?: string; model?: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scanAbortControllerRef = useRef<AbortController | null>(null);

  // Type guard for AbortError without using 'any'
  const isAbortError = (e: unknown): boolean => {
    if (typeof window === 'undefined') return false;
    if (e instanceof DOMException) return e.name === 'AbortError';
    if (typeof e === 'object' && e !== null) {
      const maybe = e as { name?: string };
      return maybe.name === 'AbortError';
    }
    return false;
  };

  // Scan modal state
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanSource, setScanSource] = useState<'local' | 'drive' | 'smb'>('local');
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Local scan form
  const [localPath, setLocalPath] = useState('');
  const [localRecurse, setLocalRecurse] = useState(true);
  const [localMaxFiles, setLocalMaxFiles] = useState(100);
  const [localExtensions, setLocalExtensions] = useState('.pdf,.docx,.pptx,.xlsx,.csv');

  // Drive scan form
  const [driveAccessToken, setDriveAccessToken] = useState('');
  const [driveFolderId, setDriveFolderId] = useState('');
  const [driveRecurse, setDriveRecurse] = useState(true);
  const [driveMaxFiles, setDriveMaxFiles] = useState(100);
  const [driveMimeFilters, setDriveMimeFilters] = useState('');

  // SMB scan form
  const [smbServer, setSmbServer] = useState('');
  const [smbShare, setSmbShare] = useState('');
  const [smbPath, setSmbPath] = useState('/');
  const [smbUsername, setSmbUsername] = useState('');
  const [smbPassword, setSmbPassword] = useState('');
  const [smbPort, setSmbPort] = useState(445);
  const [smbDomain, setSmbDomain] = useState('');
  const [smbRecurse, setSmbRecurse] = useState(true);
  const [smbMaxFiles, setSmbMaxFiles] = useState(100);
  const [smbExtensions, setSmbExtensions] = useState('.pdf,.docx,.pptx,.xlsx,.csv');

  // Google OAuth config (client-side)
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

  // Drive Folder Picker state
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [pickerFolderId, setPickerFolderId] = useState('root');
  const [pickerItems, setPickerItems] = useState<Array<{id: string; name: string}>>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch backend health to show provider/model in UI
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${config.apiBaseUrl}/health`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setBackendInfo({ provider: data?.provider, model: data?.model });
          if (data?.provider === 'huggingface') {
            setSelectedProvider('huggingface');
            if (typeof data?.model === 'string' && data.model) {
              setHfModelId(data.model);
            }
          } else if (data?.provider === 'openai') {
            setSelectedProvider('openai');
            if (typeof data?.model === 'string' && data.model) {
              setSelectedModel(data.model);
            }
          }
        }
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSendMessage = async () => {
    if (!currentQuestion.trim() || isLoading) return;

    const question = currentQuestion;
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setCurrentQuestion('');
    setIsLoading(true);

    // Create assistant message placeholder for streaming
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      progress: {
        status: 'Starting...',
        step: 0,
        total: 3,
      },
      metadata: {
        selectedDocuments: [],
        relevantPagesCount: 0,
      },
    };
    
    setMessages(prev => [...prev, assistantMessage]);

    try {
      // Create abort controller and stalled-stream watchdog
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const stallTimeoutMs = Number(process.env.NEXT_PUBLIC_CHAT_STREAM_STALL_TIMEOUT || 45000);
      let stallTimer: number | null = null;
      const resetWatchdog = () => {
        if (stallTimer) window.clearTimeout(stallTimer);
        stallTimer = window.setTimeout(() => {
          controller.abort();
        }, stallTimeoutMs);
      };

      const response = await fetch(`${config.apiBaseUrl}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          question: question,
          documents: documents,
          description: description,
          model: selectedModel,
          provider: selectedProvider,
          ...(selectedProvider === 'huggingface' && hfModelId ? { hf_model_id: hfModelId } : {}),
          chat_history: messages.map(msg => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp.toISOString()
          }))
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No reader available');
      }

      let accumulatedContent = '';
      resetWatchdog();

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          if (stallTimer) window.clearTimeout(stallTimer);
          stallTimer = null;
          break;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              resetWatchdog();
              
              if (data.type === 'status') {
                setMessages(prev => prev.map(msg => 
                  msg.id === assistantMessageId 
                    ? {
                        ...msg,
                        progress: {
                          status: data.message,
                          step: data.step_number,
                          total: data.total_steps,
                        }
                      }
                    : msg
                ));
              } else if (data.type === 'step_complete') {
                setMessages(prev => prev.map(msg => 
                  msg.id === assistantMessageId 
                    ? {
                        ...msg,
                        progress: {
                          ...msg.progress!,
                          stepCost: data.cost,
                          stepTime: data.time_taken,
                        },
                        metadata: {
                          ...msg.metadata,
                          ...(data.step === 'document_selection' && {
                            selectedDocuments: data.selected_documents,
                          }),
                          ...(data.step === 'page_selection' && {
                            relevantPagesCount: data.relevant_pages_count,
                          }),
                        }
                      }
                    : msg
                ));
              } else if (data.type === 'content') {
                accumulatedContent += data.content;
                setMessages(prev => prev.map(msg => 
                  msg.id === assistantMessageId 
                    ? { ...msg, content: accumulatedContent }
                    : msg
                ));
              } else if (data.type === 'complete') {
                if (data.cost_breakdown?.total_cost) {
                  setTotalSessionCost(prev => prev + data.cost_breakdown.total_cost);
                }
                
                setMessages(prev => prev.map(msg => 
                  msg.id === assistantMessageId 
                    ? {
                        ...msg,
                        isStreaming: false,
                        progress: undefined,
                        metadata: {
                          ...msg.metadata,
                          timing: data.timing_breakdown,
                          costs: data.cost_breakdown,
                          model: selectedModel,
                          provider: selectedProvider,
                          ...(selectedProvider === 'huggingface' && hfModelId ? { hfModelId } : {}),
                        }
                      }
                    : msg
                ));
                
                // Reset loading state when streaming is complete
                setIsLoading(false);
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (err) {
              console.warn('Failed to parse SSE data:', line, err);
            }
          }
        }
      }
    } catch (error) {
      const aborted = isAbortError(error);
      console.error('Error sending message:', error);
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId 
          ? {
              ...msg,
              content: aborted 
                ? 'Request canceled.' 
                : 'Sorry, I encountered an error while processing your question. Please try again.',
              isStreaming: false,
              progress: undefined
            }
          : msg
      ));
    } finally {
      setIsLoading(false);
      // Cleanup controller and watchdog
      try {
        // Clear any remaining watchdog
        if (typeof window !== 'undefined') {
          // ensure timer exists before clearing
          // @ts-expect-error - window type may not include clearTimeout overload in some TS configs
          if (stallTimer) window.clearTimeout(stallTimer);
        }
        abortControllerRef.current = null;
      } catch {}
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleEditDescription = () => {
    setEditedDescription(description);
    setIsEditingDescription(true);
  };

  const handleSaveDescription = () => {
    if (!editedDescription.trim()) {
      return;
    }
    onUpdateDescription(editedDescription);
    setIsEditingDescription(false);
  };

  const handleCancelEdit = () => {
    setIsEditingDescription(false);
    setEditedDescription('');
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    if (files.length > 100) {
      setUploadError('Maximum 100 files allowed');
      return;
    }

    const allowed = ['.pdf', '.docx', '.pptx', '.xlsx', '.csv'];
    const invalidFiles = files.filter(file => {
      const name = file.name.toLowerCase();
      return !allowed.some(ext => name.endsWith(ext));
    });
    if (invalidFiles.length > 0) {
      setUploadError('Unsupported files detected. Supported: PDF, DOCX, PPTX, XLSX, CSV');
      return;
    }

    const currentCount = documents.length;
    if (currentCount + files.length > 100) {
      setUploadError(`Adding ${files.length} files would exceed the 100 document limit. Current: ${currentCount}`);
      return;
    }

    const existingFilenames = documents?.map(doc => doc?.filename).filter(Boolean) || [];
    const duplicateFiles = files.filter(file => existingFilenames.includes(file.name));
    if (duplicateFiles.length > 0) {
      setUploadError(`Files already exist: ${duplicateFiles.map(f => f.name).join(', ')}`);
      return;
    }

    setSelectedNewFiles(files);
    setUploadError('');
  };

  const removeNewFile = (index: number) => {
    setSelectedNewFiles(files => files.filter((_, i) => i !== index));
  };

  const handleUploadNewFiles = async () => {
    if (selectedNewFiles.length === 0) {
      setUploadError('Please select at least one supported file');
      return;
    }

    setIsUploadingFiles(true);
    setUploadError('');
    setUploadProgress(null);

    try {
      // Check if chunking will be needed
      const needsChunking = ChunkedUploader.needsChunking(selectedNewFiles);
      
      // Use the new ChunkedUploader
      const result = await ChunkedUploader.upload({
        endpoint: `${config.apiBaseUrl}/upload`,
        files: selectedNewFiles,
        description: description,
        onProgress: (progress) => {
          setUploadProgress({
            ...progress,
            isChunked: needsChunking
          });
          console.log(`Upload progress: ${progress.percentComplete}% (${progress.processedFiles}/${progress.totalFiles} files, chunk ${progress.currentChunk}/${progress.totalChunks})`);
        },
        onChunkComplete: (chunkIndex, totalChunks) => {
          console.log(`Completed chunk ${chunkIndex + 1} of ${totalChunks}`);
        }
      });

      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      console.log('Upload response:', result);
      
      // Validate the response format
      if (!result.documents || !Array.isArray(result.documents)) {
        console.error('Invalid response format. Expected documents array, got:', result);
        throw new Error(`Invalid response format from server. Expected documents array, got: ${JSON.stringify(result, null, 2)}`);
      }
      
      // Get the highest existing ID
      const maxId = documents && documents.length > 0 ? Math.max(...documents.map(d => d?.id || 0).filter(id => id > 0)) : 0;
      
      // Update IDs for new documents
      const newDocuments = result.documents.map((doc: DocumentData, index: number) => ({
        ...doc,
        id: maxId + index + 1
      }));
      
      // Add to existing documents
      onUpdateDocuments([...documents, ...newDocuments]);
      
      setSelectedNewFiles([]);
      setShowUploadSection(false);
      
      // Show success message with chunking info
      const uploadMessage = result.chunked 
        ? `Successfully uploaded ${result.totalFiles} files using ${ChunkedUploader.estimateChunks(selectedNewFiles)} chunks`
        : `Successfully uploaded ${result.totalFiles} files`;
      
      console.log(uploadMessage);
      
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploadingFiles(false);
      setUploadProgress(null);
    }
  };

  const handleCancelUpload = () => {
    setSelectedNewFiles([]);
    setShowUploadSection(false);
    setUploadError('');
  };

  // Helpers
  const mergeNewDocuments = (newDocs: DocumentData[]) => {
    // Get the highest existing ID
    const maxId = documents && documents.length > 0 ? Math.max(...documents.map(d => d?.id || 0).filter(id => id > 0)) : 0;
    const adjusted = newDocs.map((doc, index) => ({ ...doc, id: maxId + index + 1 }));
    onUpdateDocuments([...documents, ...adjusted]);
  };

  // Scan handlers
  const handleGoogleSignIn = () => {
    setScanError(null);
    try {
      if (!googleClientId) {
        setScanError('Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID in environment.');
        return;
      }

      const redirectUri = window.location.origin; // must be registered in Google console
      const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.readonly');
      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth` +
        `?response_type=token` +
        `&client_id=${encodeURIComponent(googleClientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${scope}` +
        `&include_granted_scopes=true` +
        `&prompt=consent`;

      const popup = window.open(
        authUrl,
        'google_oauth',
        'width=500,height=700,menubar=no,toolbar=no,status=no,scrollbars=yes'
      );

      if (!popup) {
        setScanError('Popup blocked by the browser. Please allow popups and try again.');
        return;
      }

      const timer = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(timer);
            return;
          }
          // When redirected back to same origin, we can read the hash
          if (popup.location.origin === window.location.origin) {
            const hash = popup.location.hash || '';
            if (hash.includes('access_token')) {
              const params = new URLSearchParams(hash.replace(/^#/, ''));
              const token = params.get('access_token');
              if (token) {
                setDriveAccessToken(token);
              } else {
                setScanError('No access token returned.');
              }
              popup.close();
              clearInterval(timer);
            }
          }
        } catch {
          // Ignore cross-origin errors until redirected back
        }
      }, 500);
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : 'Google sign-in failed');
    }
  };

  const loadDriveFolderChildren = async (folderId: string) => {
    setPickerError(null);
    setPickerLoading(true);
    try {
      const q = encodeURIComponent(`'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${driveAccessToken}` },
      });
      if (!res.ok) throw new Error(`Failed to list folders (${res.status})`);
      const data: { files?: Array<{ id: string; name: string }> } = await res.json();
      const items = (data.files || []).map(f => ({ id: f.id, name: f.name }));
      setPickerItems(items);
    } catch (err: unknown) {
      setPickerError(err instanceof Error ? err.message : 'Failed to load folders');
      setPickerItems([]);
    } finally {
      setPickerLoading(false);
    }
  };

  const openDrivePicker = async () => {
    if (!driveAccessToken) {
      setScanError('Sign in to Google first');
      return;
    }
    const startId = driveFolderId || 'root';
    setPickerFolderId(startId);
    setShowDrivePicker(true);
    await loadDriveFolderChildren(startId);
  };

  const handleScanLocal = async () => {
    setScanError(null);
    if (!localPath.trim()) {
      setScanError('Provide a local path.');
      return;
    }
    setScanLoading(true);
    try {
      // Setup abortable timeout for scan
      const controller = new AbortController();
      scanAbortControllerRef.current = controller;
      const stallTimeoutMs = Number(process.env.NEXT_PUBLIC_SCAN_STALL_TIMEOUT || 45000);
      let stallTimer: number | null = null;
      const startWatchdog = () => {
        if (stallTimer) window.clearTimeout(stallTimer);
        stallTimer = window.setTimeout(() => {
          controller.abort();
        }, stallTimeoutMs);
      };
      startWatchdog();

      const exts = localExtensions
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);
      const res = await fetch(`${config.apiBaseUrl}/scan-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          path: localPath,
          recurse: localRecurse,
          maxFiles: localMaxFiles,
          extensions: exts.length ? exts : undefined,
        }),
      });
      if (!res.ok) throw new Error(`Local scan failed (${res.status})`);
      const data = await res.json();
      if (!data?.documents || !Array.isArray(data.documents)) throw new Error('Invalid response format');
      mergeNewDocuments(data.documents);
      setShowScanModal(false);
    } catch (err: unknown) {
      setScanError(
        isAbortError(err)
          ? 'Scan canceled or timed out.'
          : err instanceof Error
            ? err.message
            : 'Local scan failed'
      );
    } finally {
      setScanLoading(false);
      try {
        if (typeof window !== 'undefined') {
          // @ts-expect-error - timeout type variations across TS configs
          if (stallTimer) window.clearTimeout(stallTimer);
        }
        scanAbortControllerRef.current = null;
      } catch {}
    }
  };

  const handleScanDrive = async () => {
    setScanError(null);
    if (!driveAccessToken.trim() || !driveFolderId.trim()) {
      setScanError('Provide both Access Token and Folder ID.');
      return;
    }
    setScanLoading(true);
    try {
      // Setup abortable timeout for scan
      const controller = new AbortController();
      scanAbortControllerRef.current = controller;
      const stallTimeoutMs = Number(process.env.NEXT_PUBLIC_SCAN_STALL_TIMEOUT || 45000);
      let stallTimer: number | null = null;
      const startWatchdog = () => {
        if (stallTimer) window.clearTimeout(stallTimer);
        stallTimer = window.setTimeout(() => {
          controller.abort();
        }, stallTimeoutMs);
      };
      startWatchdog();

      const mimes = driveMimeFilters
        .split(',')
        .map(m => m.trim())
        .filter(Boolean);
      const res = await fetch(`/api/ingest/drive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          accessToken: driveAccessToken,
          folderId: driveFolderId,
          recurse: driveRecurse,
          maxFiles: driveMaxFiles,
          mimeFilters: mimes.length ? mimes : undefined,
        }),
      });
      if (!res.ok) throw new Error(`Drive scan failed (${res.status})`);
      const data = await res.json();
      if (!data?.documents || !Array.isArray(data.documents)) throw new Error('Invalid response format');
      mergeNewDocuments(data.documents);
      setShowScanModal(false);
    } catch (err: unknown) {
      setScanError(
        isAbortError(err)
          ? 'Scan canceled or timed out.'
          : err instanceof Error
            ? err.message
            : 'Drive scan failed'
      );
    } finally {
      setScanLoading(false);
      try {
        if (typeof window !== 'undefined') {
          // @ts-expect-error - timeout type variations across TS configs
          if (stallTimer) window.clearTimeout(stallTimer);
        }
        scanAbortControllerRef.current = null;
      } catch {}
    }
  };

  const handleScanSMB = async () => {
    setScanError(null);
    if (!smbServer.trim() || !smbShare.trim() || !smbUsername.trim() || !smbPassword.trim()) {
      setScanError('Server, share, username, and password are required.');
      return;
    }
    setScanLoading(true);
    try {
      // Setup abortable timeout for scan
      const controller = new AbortController();
      scanAbortControllerRef.current = controller;
      const stallTimeoutMs = Number(process.env.NEXT_PUBLIC_SCAN_STALL_TIMEOUT || 45000);
      let stallTimer: number | null = null;
      const startWatchdog = () => {
        if (stallTimer) window.clearTimeout(stallTimer);
        stallTimer = window.setTimeout(() => {
          controller.abort();
        }, stallTimeoutMs);
      };
      startWatchdog();

      const exts = smbExtensions
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);
      type SmbScanBody = {
        server: string;
        share: string;
        path: string;
        username: string;
        password: string;
        port: number;
        domain?: string;
        recurse: boolean;
        maxFiles: number;
        extensions?: string[];
      };
      const body: SmbScanBody = {
        server: smbServer,
        share: smbShare,
        path: smbPath || '/',
        username: smbUsername,
        password: smbPassword,
        port: smbPort,
        domain: smbDomain || undefined,
        recurse: smbRecurse,
        maxFiles: smbMaxFiles,
        extensions: exts.length ? exts : undefined,
      };
      const res = await fetch(`${config.apiBaseUrl}/scan-smb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`SMB scan failed (${res.status})`);
      const data = await res.json();
      if (!data?.documents || !Array.isArray(data.documents)) throw new Error('Invalid response format');
      mergeNewDocuments(data.documents);
      setShowScanModal(false);
    } catch (err: unknown) {
      setScanError(
        isAbortError(err)
          ? 'Scan canceled or timed out.'
          : err instanceof Error
            ? err.message
            : 'SMB scan failed'
      );
    } finally {
      setScanLoading(false);
      try {
        if (typeof window !== 'undefined') {
          // @ts-expect-error - timeout type variations across TS configs
          if (stallTimer) window.clearTimeout(stallTimer);
        }
        scanAbortControllerRef.current = null;
      } catch {}
    }
  };

  const handleDeleteDocument = (documentId: number) => {
    // Confirm deletion
    if (confirm('Are you sure you want to delete this document?')) {
      const updatedDocuments = documents.filter(doc => doc.id !== documentId);
      onUpdateDocuments(updatedDocuments);
      
      // If no documents left, clear description as well
      if (updatedDocuments.length === 0) {
        onUpdateDescription('');
      }
    }
  };

  // Function to process page references in content before markdown
  const processPageReferences = (content: string): string => {
    if (!content.includes('$PAGE_START')) {
      return content;
    }
    
    // Parse special markers: $PAGE_STARTfilename:pages$PAGE_END
    const pageRefRegex = /\$PAGE_START([^:]+):([^\$]+)\$PAGE_END/g;
    
    // Replace markers with markdown links
    const processedContent = content.replace(pageRefRegex, (match, filename, pageSpec) => {
      const cleanFilename = filename.trim();
      const cleanPageSpec = pageSpec.trim();
      
      // Convert to markdown link format with special data attributes
      return `[${cleanFilename} (Page ${cleanPageSpec})](javascript:void(0) "data-page-ref=${cleanFilename}:${cleanPageSpec}")`;
    });
    
    return processedContent;
  };

  // Helper function to parse page specifications like "5", "2,7,12", "15-18"
  const parsePageSpecification = (pageSpec: string): number[] => {
    const pages: number[] = [];
    
    // Split by commas for multiple pages/ranges
    const parts = pageSpec.split(',');
    
    parts.forEach(part => {
      part = part.trim();
      
      if (part.includes('-')) {
        // Handle range like "15-18"
        const [start, end] = part.split('-').map(p => parseInt(p.trim()));
        if (start && end && start <= end) {
          for (let i = start; i <= end; i++) {
            pages.push(i);
          }
        }
      } else {
        // Handle single page
        const pageNum = parseInt(part);
        if (pageNum) {
          pages.push(pageNum);
        }
      }
    });
    
    return pages;
  };

  const handlePageReference = (filename: string, pageNumber: number) => {
    // Find the document and page content
    const document = documents.find(doc => doc.filename === filename);
    if (!document) {
      console.error('Document not found:', filename);
      return;
    }
    
    const page = document.pages.find(p => p.page_number === pageNumber);
    if (!page) {
      console.error('Page not found:', pageNumber, 'in', filename);
      return;
    }
    
    setSelectedPageContent({
      content: page.text,
      pageNumber: pageNumber,
      filename: filename
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
          <div className="flex justify-between items-center mb-3">
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-800">Chat with your documents</h2>
              <div className="flex items-center space-x-2 mt-1">
                <p className="text-sm text-gray-600">
                  {documents.length} document(s) {documents.length > 0 ? '•' : ''}
                </p>
                {backendInfo?.provider && (
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-200" title="Active LLM provider and model">
                    {backendInfo.provider === 'huggingface' ? 'Hugging Face' : backendInfo.provider}
                    {backendInfo.model ? ` • ${backendInfo.model}` : ''}
                  </span>
                )}
                {isEditingDescription ? (
                <div className="flex items-center space-x-2 flex-1">
                  <input
                    type="text"
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    className="text-sm text-gray-600 border border-gray-300 rounded px-2 py-1 flex-1"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveDescription();
                      } else if (e.key === 'Escape') {
                        handleCancelEdit();
                      }
                    }}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveDescription}
                    className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="text-xs bg-gray-500 text-white px-2 py-1 rounded hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
                              ) : documents.length > 0 ? (
                  <div className="flex items-center space-x-2">
                    <p className="text-sm text-gray-600">{description}</p>
                    <button
                      onClick={handleEditDescription}
                      className="text-xs text-blue-600 hover:text-blue-800"
                      title="Edit description"
                    >
                      Update document usage guide ✏️ 
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">Upload your first document (PDF, DOCX, PPTX, XLSX, CSV) to get started</p>
                )}
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowUploadSection(!showUploadSection)}
              className={documents.length === 0 
                ? "bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded text-sm font-medium"
                : "text-gray-500 hover:text-gray-700 px-3 py-1 rounded border border-gray-300 hover:border-gray-400 text-sm"
              }
            >
              {documents.length === 0 ? "Add Your First Document" : "Add Files"}
            </button>
            <button
              onClick={() => setShowScanModal(true)}
              className="text-gray-500 hover:text-gray-700 px-3 py-1 rounded border border-gray-300 hover:border-gray-400 text-sm"
            >
              Scan
            </button>
            <button
              onClick={onReset}
              className="text-gray-500 hover:text-gray-700 px-3 py-1 rounded border border-gray-300 hover:border-gray-400"
            >
              Start new session
            </button>
            {isLoading && (
              <button
                onClick={() => abortControllerRef.current?.abort()}
                className="bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1 rounded border border-red-200 text-sm"
                title="Cancel current request"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Upload Section */}
        {showUploadSection && (
          <div className="bg-gray-50 rounded-lg p-4 mb-3">
            <h3 className="text-lg font-medium text-gray-800 mb-3">Add New Documents</h3>
            
            <div className="mb-4">
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.pptx,.xlsx,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="text-gray-600">
                  <svg className="mx-auto h-8 w-8 text-gray-400 mb-2" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-sm">Click to select documents (PDF, DOCX, PPTX, XLSX, CSV) or drag and drop</p>
                </div>
              </div>
            </div>

            {selectedNewFiles.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Selected Files ({selectedNewFiles.length})
                </h4>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {selectedNewFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-white p-2 rounded border">
                      <span className="text-sm text-gray-700 truncate">{file.name}</span>
                      <button
                        onClick={() => removeNewFile(index)}
                        className="text-red-500 hover:text-red-700 flex-shrink-0 ml-2"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {uploadError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-600 text-sm">{uploadError}</p>
              </div>
            )}

            <div className="flex space-x-2">
              <button
                onClick={handleUploadNewFiles}
                disabled={isUploadingFiles || selectedNewFiles.length === 0}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
              >
                {isUploadingFiles ? 'Uploading...' : `Upload ${selectedNewFiles.length} file(s)`}
              </button>
              <button
                onClick={handleCancelUpload}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Scan Modal */}
        {showScanModal && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-medium text-gray-800">Scan Documents</h3>
                <button onClick={() => setShowScanModal(false)} className="text-gray-500 hover:text-gray-700">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Source tabs */}
              <div className="flex space-x-2 mb-4">
                {(['local','drive','smb'] as const).map(src => (
                  <button
                    key={src}
                    onClick={() => { setScanSource(src); setScanError(null); }}
                    className={`px-3 py-1 rounded text-sm border ${scanSource === src ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-700 border-gray-300 hover:bg-gray-100'}`}
                  >
                    {src === 'local' ? 'Local' : src === 'drive' ? 'Google Drive' : 'SMB Share'}
                  </button>
                ))}
              </div>

              {/* Forms */}
              {scanSource === 'local' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Local path (under SCAN_BASE_DIR)</label>
                    <input value={localPath} onChange={e => setLocalPath(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" placeholder="/absolute/or/relative/path" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="inline-flex items-center space-x-2 text-sm"><input type="checkbox" checked={localRecurse} onChange={e => setLocalRecurse(e.target.checked)} /><span>Recursive</span></label>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm">Max files</span>
                      <input type="number" min={1} value={localMaxFiles} onChange={e => setLocalMaxFiles(parseInt(e.target.value) || 1)} className="border rounded px-2 py-1 text-sm w-24" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Extensions (comma-separated)</label>
                    <input value={localExtensions} onChange={e => setLocalExtensions(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                  </div>
                  {scanError && <p className="text-red-600 text-sm">{scanError}</p>}
                  <div className="flex justify-end space-x-2">
                    <button onClick={() => { if (scanLoading) scanAbortControllerRef.current?.abort(); setShowScanModal(false); }} className="px-3 py-1 text-sm border rounded text-gray-700">{scanLoading ? 'Cancel scan' : 'Cancel'}</button>
                    <button onClick={handleScanLocal} disabled={scanLoading} className="px-3 py-1 text-sm rounded bg-blue-600 text-white disabled:opacity-50">{scanLoading ? 'Scanning...' : 'Scan'}</button>
                  </div>
                </div>
              )}

              {scanSource === 'drive' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
                      <div className="flex space-x-2">
                        <input value={driveAccessToken} onChange={e => setDriveAccessToken(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" placeholder="Paste Google OAuth access token" />
                        <button type="button" onClick={handleGoogleSignIn} className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100" title={googleClientId ? 'Sign in with Google to fetch token' : 'Set NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable sign-in'}>
                          Sign in
                        </button>
                      </div>
                      {driveAccessToken && (
                        <p className="text-xs text-green-600 mt-1">Token loaded</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Folder ID</label>
                      <div className="flex space-x-2">
                        <input value={driveFolderId} onChange={e => setDriveFolderId(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" placeholder="Drive folder ID" />
                        <button type="button" onClick={openDrivePicker} className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100" disabled={!driveAccessToken} title={!driveAccessToken ? 'Sign in to Google first' : 'Browse folders'}>
                          Browse
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="inline-flex items-center space-x-2 text-sm"><input type="checkbox" checked={driveRecurse} onChange={e => setDriveRecurse(e.target.checked)} /><span>Recursive</span></label>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm">Max files</span>
                      <input type="number" min={1} value={driveMaxFiles} onChange={e => setDriveMaxFiles(parseInt(e.target.value) || 1)} className="border rounded px-2 py-1 text-sm w-24" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">MIME filters (comma-separated)</label>
                    <input value={driveMimeFilters} onChange={e => setDriveMimeFilters(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" placeholder="e.g., application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
                  </div>
                  {scanError && <p className="text-red-600 text-sm">{scanError}</p>}
                  <div className="flex justify-end space-x-2">
                    <button onClick={() => { if (scanLoading) scanAbortControllerRef.current?.abort(); setShowScanModal(false); }} className="px-3 py-1 text-sm border rounded text-gray-700">{scanLoading ? 'Cancel scan' : 'Cancel'}</button>
                    <button onClick={handleScanDrive} disabled={scanLoading} className="px-3 py-1 text-sm rounded bg-blue-600 text-white disabled:opacity-50">{scanLoading ? 'Scanning...' : 'Scan'}</button>
                  </div>
                </div>
              )}

              {scanSource === 'smb' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Server (host/IP)</label>
                      <input value={smbServer} onChange={e => setSmbServer(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Share</label>
                      <input value={smbShare} onChange={e => setSmbShare(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Path</label>
                      <input value={smbPath} onChange={e => setSmbPath(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" placeholder="/ or /folder" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                      <input type="number" value={smbPort} onChange={e => setSmbPort(parseInt(e.target.value) || 445)} className="w-full border rounded px-2 py-1 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                      <input value={smbUsername} onChange={e => setSmbUsername(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                      <input type="password" value={smbPassword} onChange={e => setSmbPassword(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Domain (optional)</label>
                      <input value={smbDomain} onChange={e => setSmbDomain(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                    </div>
                    <div className="flex items-center space-x-2">
                      <label className="inline-flex items-center space-x-2 text-sm"><input type="checkbox" checked={smbRecurse} onChange={e => setSmbRecurse(e.target.checked)} /><span>Recursive</span></label>
                      <span className="text-sm">Max files</span>
                      <input type="number" min={1} value={smbMaxFiles} onChange={e => setSmbMaxFiles(parseInt(e.target.value) || 1)} className="border rounded px-2 py-1 text-sm w-24" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Extensions (comma-separated)</label>
                    <input value={smbExtensions} onChange={e => setSmbExtensions(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
                  </div>
                  {scanError && <p className="text-red-600 text-sm">{scanError}</p>}
                  <div className="flex justify-end space-x-2">
                    <button onClick={() => { if (scanLoading) scanAbortControllerRef.current?.abort(); setShowScanModal(false); }} className="px-3 py-1 text-sm border rounded text-gray-700">{scanLoading ? 'Cancel scan' : 'Cancel'}</button>
                    <button onClick={handleScanSMB} disabled={scanLoading} className="px-3 py-1 text-sm rounded bg-blue-600 text-white disabled:opacity-50">{scanLoading ? 'Scanning...' : 'Scan'}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Drive Folder Picker Modal */}
        {showDrivePicker && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-medium text-gray-800">Browse Google Drive Folders</h3>
                <button onClick={() => setShowDrivePicker(false)} className="text-gray-500 hover:text-gray-700" title="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Folder ID</label>
                  <div className="flex space-x-2">
                    <input
                      value={pickerFolderId}
                      onChange={e => setPickerFolderId(e.target.value)}
                      className="w-full border rounded px-2 py-1 text-sm"
                      placeholder="Drive folder id (e.g., root)"
                    />
                    <button
                      type="button"
                      onClick={() => loadDriveFolderChildren(pickerFolderId)}
                      disabled={pickerLoading}
                      className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
                      title="Load child folders"
                    >
                      Go
                    </button>
                  </div>
                </div>

                {pickerError && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{pickerError}</div>
                )}

                <div className="border rounded p-2 max-h-72 overflow-auto">
                  {pickerLoading ? (
                    <p className="text-sm text-gray-600">Loading folders...</p>
                  ) : pickerItems.length === 0 ? (
                    <p className="text-sm text-gray-500">No subfolders found.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {pickerItems.map(item => (
                        <li key={item.id} className="py-2 flex items-center justify-between">
                          <div className="min-w-0 pr-2">
                            <p className="text-sm text-gray-800 truncate" title={`${item.name} (${item.id})`}>
                              {item.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">{item.id}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setPickerFolderId(item.id);
                              loadDriveFolderChildren(item.id);
                            }}
                            className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
                          >
                            Open
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex justify-end space-x-2">
                  <button
                    onClick={() => setShowDrivePicker(false)}
                    className="px-3 py-1 text-sm border rounded text-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setDriveFolderId(pickerFolderId);
                      setShowDrivePicker(false);
                    }}
                    className="px-3 py-1 text-sm rounded bg-blue-600 text-white"
                  >
                    Use this folder
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Document List */}
        {documents.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setShowDocuments(!showDocuments)}
                className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                <span>Uploaded Documents</span>
                <svg
                  className={`w-4 h-4 transition-transform ${showDocuments ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div className="flex items-center space-x-3">
                <span className="text-xs text-gray-500">{documents.length} files</span>
                <span className="text-xs font-medium text-green-600">
                  Cost: ${totalSessionCost.toFixed(4)}
                </span>
              </div>
            </div>
            {showDocuments && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {documents.map((doc, index) => (
                <div
                  key={index}
                  className="flex items-center space-x-2 bg-white p-2 rounded border border-gray-200"
                >
                  <div className="flex-shrink-0">
                    <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate" title={doc.filename}>
                      ID {doc.id}: {doc.filename}
                    </p>
                    <p className="text-xs text-gray-500">
                      {doc.total_pages} pages
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteDocument(doc.id);
                    }}
                    className="flex-shrink-0 ml-2 text-red-500 hover:text-red-700 p-1"
                    title="Delete document"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {documents.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No documents uploaded</h3>
              <p className="text-gray-500 mb-4">
                Upload documents (PDF, DOCX, PPTX, XLSX, CSV) to start chatting about their content. Click &quot;Add Files&quot; above to get started.
              </p>
              <button
                onClick={() => setShowUploadSection(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Add Your First Document
              </button>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <p>Ask me anything about your uploaded documents!</p>
            <p className="text-sm mt-2">Examples:</p>
            <ul className="text-sm mt-1 space-y-1">
              <li>• &quot;What are the main topics covered?&quot;</li>
              <li>• &quot;Summarize the key findings&quot;</li>
              <li>• &quot;What does it say about [specific topic]?&quot;</li>
            </ul>
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-lg ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              {/* Progress indicator for streaming messages */}
              {message.isStreaming && message.progress && (
                <div className="mb-3 p-3 bg-blue-50 rounded-lg border-l-4 border-blue-400">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <span className="text-sm font-medium text-blue-800">
                      {message.progress.status}
                    </span>
                  </div>
                  
                  <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${(message.progress.step / message.progress.total) * 100}%` }}
                    ></div>
                  </div>
                  
                  <div className="flex justify-between text-xs text-blue-600">
                    <span>Step {message.progress.step} of {message.progress.total}</span>
                    {message.progress.stepTime && message.progress.stepCost && (
                      <span>{message.progress.stepTime.toFixed(2)}s • ${message.progress.stepCost.toFixed(4)}</span>
                    )}
                  </div>
                </div>
              )}

              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    a: ({ href, title, children }) => {
                      // Handle page reference links
                      if (title && title.startsWith('data-page-ref=')) {
                        const pageRef = title.replace('data-page-ref=', '');
                        const [filename, pageSpec] = pageRef.split(':');
                        const pages = parsePageSpecification(pageSpec);
                        
                        if (pages.length > 0) {
                          const pageNum = pages[0]; // Use first page for click
                          return (
                            <button
                              onClick={() => handlePageReference(filename, pageNum)}
                              className="text-blue-600 hover:text-blue-800 underline font-medium cursor-pointer mx-0.5"
                              title={`View ${filename} - Page ${pageNum} content`}
                            >
                              {children}
                            </button>
                          );
                        }
                      }
                      
                      // Regular links
                      return (
                        <a href={href} title={title} className="text-blue-600 hover:text-blue-800 underline">
                          {children}
                        </a>
                      );
                    },
                    h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
                    ul: ({ children }) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
                    li: ({ children }) => <li className="mb-1">{children}</li>,
                    code: ({ children, ...props }) => {
                      const isInline = !props.className?.includes('language-');
                      const bgColor = message.role === 'user' ? 'bg-blue-700 bg-opacity-50' : 'bg-gray-200';
                      return isInline ? (
                        <code className={`${bgColor} px-1 rounded text-xs font-mono`}>{children}</code>
                      ) : (
                        <code className={`block ${bgColor} p-2 rounded text-xs font-mono whitespace-pre-wrap`}>{children}</code>
                      );
                    },
                    strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                  }}
                >
                  {processPageReferences(message.content)}
                </ReactMarkdown>
              </div>
              {message.metadata && (
                <div className="mt-2 text-xs opacity-60 space-y-1">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {message.metadata.selectedDocuments && (
                      <span><span className="font-medium">Docs:</span> {message.metadata.selectedDocuments.map(doc => `${doc.filename} (ID: ${doc.id})`).join(', ')}</span>
                    )}
                    {message.metadata.relevantPagesCount && (
                      <span><span className="font-medium">Pages:</span> {message.metadata.relevantPagesCount}</span>
                    )}
                    {message.metadata.provider && (
                      <span><span className="font-medium">Provider:</span> {message.metadata.provider === 'huggingface' ? 'Hugging Face' : message.metadata.provider}</span>
                    )}
                    {message.metadata.model && (
                      <span><span className="font-medium">Model:</span> {message.metadata.model}</span>
                    )}
                    {message.metadata.hfModelId && (
                      <span><span className="font-medium">HF Model:</span> {message.metadata.hfModelId}</span>
                    )}
                    {message.metadata.timing?.total_time && (
                      <span><span className="font-medium">Time:</span> {message.metadata.timing.total_time.toFixed(1)}s</span>
                    )}
                    {message.metadata.costs?.total_cost && (
                      <span><span className="font-medium">Cost:</span> ${message.metadata.costs.total_cost.toFixed(4)}</span>
                    )}
                  </div>
                </div>
              )}
              <p className={`text-xs mt-1 ${
                message.role === 'user' ? 'text-blue-200' : 'text-gray-500'
              }`}>
                {message.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        {/* Provider & Model Selection */}
        <div className="mb-3 space-y-3">
          {/* Provider Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Provider:</label>
            <div className="flex items-center gap-6">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="provider"
                  value="openai"
                  checked={selectedProvider === 'openai'}
                  onChange={() => setSelectedProvider('openai')}
                  disabled={isLoading}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">OpenAI</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="provider"
                  value="huggingface"
                  checked={selectedProvider === 'huggingface'}
                  onChange={() => setSelectedProvider('huggingface')}
                  disabled={isLoading}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Hugging Face</span>
              </label>
            </div>
          </div>

          {/* HF Model ID (visible for Hugging Face) */}
          {selectedProvider === 'huggingface' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">HF Model ID (optional override)</label>
              <input
                type="text"
                value={hfModelId}
                onChange={(e) => setHfModelId(e.target.value)}
                placeholder={backendInfo?.provider === 'huggingface' && backendInfo?.model ? backendInfo.model : 'e.g. mistralai/Mistral-7B-Instruct'}
                disabled={isLoading}
                className="w-full px-3 py-2 text-gray-700 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {/* OpenAI Model Radios */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">OpenAI Model:</label>
            <div className="flex space-x-4">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="model"
                  value="gpt-5-mini"
                  checked={selectedModel === 'gpt-5-mini'}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={isLoading || selectedProvider !== 'openai'}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">GPT-5 Mini (Faster, Lower Cost)</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="model"
                  value="gpt-5"
                  checked={selectedModel === 'gpt-5'}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={isLoading || selectedProvider !== 'openai'}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">GPT-5 (Higher Quality, Higher Cost)</span>
              </label>
            </div>
          </div>
        </div>
        
        <div className="flex space-x-2">
          <textarea
            value={currentQuestion}
            onChange={(e) => setCurrentQuestion(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={documents.length === 0 ? "Upload documents first to start chatting..." : "Ask a question about your documents..."}
            className="flex-1 px-3 py-2 text-gray-700 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            rows={2}
            disabled={isLoading || documents.length === 0}
          />
          <button
            onClick={handleSendMessage}
            disabled={!currentQuestion.trim() || isLoading || documents.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>

      {/* Page Content Modal */}
      {selectedPageContent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl max-h-[80vh] w-full flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">
                  {selectedPageContent.filename} - Page {selectedPageContent.pageNumber}
                </h3>
                <p className="text-sm text-gray-600">Extracted Text Content</p>
              </div>
              <button
                onClick={() => setSelectedPageContent(null)}
                className="text-gray-500 hover:text-gray-700 focus:outline-none"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-6">
              <div className="prose prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
                  {selectedPageContent.content}
                </div>
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="flex justify-end p-4 border-t border-gray-200">
              <button
                onClick={() => setSelectedPageContent(null)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 