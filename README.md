# Vectorless Documents Insights

A revolutionary document chatbot that uses **no vector embeddings** or traditional RAG. Instead, it leverages Large Language Models for intelligent document selection and page relevance detection, providing a completely stateless and privacy-first experience.

## 🚀 What Makes This "Vectorless"?

Traditional document chatbots convert documents into vector embeddings for semantic search. This approach:
- **❌ Requires expensive vector databases**
- **❌ Needs pre-processing and indexing**
- **❌ Stores document data on servers**
- **❌ Loses context and nuance in embeddings**

Our **Vectorless** approach:
- **✅ Uses LLM reasoning instead of vectors**
- **✅ Processes documents in real-time**
- **✅ Completely stateless - no server storage**
- **✅ Preserves full document context**
- **✅ Privacy-first - documents stay in your browser**

## 🧠 How the Vectorless Process Works

### 3-Step Intelligent Document Analysis

```mermaid
graph TD
    A[📄 User uploads documents] --> B[🧠 LLM Document Selection]
    B --> C[🎯 LLM Page Relevance Detection]
    C --> D[💬 Contextual Answer Generation]
    
    B --> B1[Analyzes collection description<br/>+ document filenames<br/>+ user question]
    C --> C1[Examines actual page content<br/>from selected documents<br/>in parallel processing]
    D --> D1[Generates comprehensive answer<br/>with proper citations]
```

### Step 1: 🧠 **Smart Document Selection**
- LLM reads your collection description and document filenames
- Intelligently selects which documents are likely to contain relevant information
- No embeddings needed - uses reasoning and context understanding

### Step 2: 🎯 **Page Relevance Detection**
- LLM examines actual page content from selected documents
- Processes multiple documents in parallel for speed
- Identifies the most relevant pages based on question context

### Step 3: 💬 **Contextual Answer Generation**
- Uses only the relevant pages to generate accurate answers
- Maintains full document context and nuance
- Provides proper citations and references

## ✨ Key Features

### 🔒 **Privacy-First & Stateless**
- **Zero Server Storage**: Documents processed and stored entirely in your browser
- **LocalStorage Persistence**: Your documents persist across browser sessions
- **No Data Leakage**: Document content never persists on servers
- **Serverless-Friendly**: Perfect for Vercel/Netlify deployments

### 📁 **Advanced File Handling**
- **Up to 100 documents** per session
- **Supported formats**: PDF, DOCX, PPTX, XLSX, CSV
- **Chunked Upload System**: Automatically handles large file sets (>4.5MB)
- **Vercel limits**: 4.5MB per file/request on serverless; local FastAPI supports larger files (subject to system limits)
- **Scan sources**: Local folder, Google Drive, SMB (dev)
- **Real-time Processing**: No pre-indexing required

### 💡 **Intelligent Processing**
- **Multi-Model Support**: GPT-4, GPT-5-mini, and more
- **Parallel Processing**: Multiple documents analyzed simultaneously
- **Context Preservation**: Full document context maintained throughout
- **Dynamic Descriptions**: Edit collection descriptions anytime

### 🎨 **Modern Interface**
- **Responsive Design**: Works on desktop and mobile
- **Real-time Progress**: Visual feedback during uploads and processing
- **GitHub Integration**: Easy access to source code
- **Error Handling**: Comprehensive error messages and recovery

## 🛠 Technology Stack

### Frontend
- **Next.js 15**: React framework with App Router
- **TypeScript**: Type safety and better development experience
- **Tailwind CSS**: Modern utility-first styling
- **Lucide React**: Beautiful, consistent icons

### Backend

- **FastAPI (local dev)**: Endpoints `/upload`, `/chat/stream`, `/scan-folder`, `/scan-smb`
- **Vercel Python serverless**: Endpoints `/api/upload`, `/api/chat/stream`, `/api/ingest/drive`, `/api/health`
- **Document processing**: PyPDF2 (PDF), python-docx (DOCX), python-pptx (PPTX), openpyxl (XLSX), CSV
- **LLM Providers**: OpenAI SDK (default) or Hugging Face Inference API (optional)
- **Chunked Processing**: Handles large uploads efficiently

### Infrastructure
- **Vercel Deployment**: Seamless serverless hosting
- **No Databases**: Completely stateless architecture
- **Automatic Scaling**: Handle traffic spikes effortlessly

## 🚀 Quick Start

### Prerequisites
- Node.js 20.x and npm
- Python 3.11+ (for local FastAPI backend)
- OpenAI API key

### 1. Clone and Install
```bash
git clone https://github.com/pkurri/vectorless-documents-insights.git
cd vectorless-documents-insights
npm install
```

### 2. Environment Setup

Create `.env.local`:

```bash
# Provider selection (default: openai)
LLM_PROVIDER=openai # or huggingface

# OpenAI (used when LLM_PROVIDER=openai)
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5-mini

# Hugging Face (used when LLM_PROVIDER=huggingface)
# Get a token from https://huggingface.co/settings/tokens
HF_API_TOKEN=your_hf_api_token
HF_MODEL_ID=meta-llama/Meta-Llama-3.1-8B-Instruct
HF_API_BASE=https://api-inference.huggingface.co/models
HF_TEMPERATURE=0.3

# For local FastAPI backend (defaults to http://localhost:8000 if omitted)
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# Optional: enable Google Drive OAuth in Scan dialog (client-side only)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

### 3. Run Locally

```bash
# Start only the frontend (Next.js)
npm run dev

# Start only the backend (FastAPI on :8000)
npm run backend

# Start both concurrently
npm run dev:all
```
Visit http://localhost:3000. The frontend will call the backend at `NEXT_PUBLIC_API_BASE_URL` (or default `http://localhost:8000`).

### 4. Deploy to Vercel

1. Push to GitHub
2. Connect to Vercel
3. Set environment variables based on your provider:
   - If using OpenAI: `OPENAI_API_KEY=your_key` (optionally `OPENAI_MODEL`)
   - If using Hugging Face: `LLM_PROVIDER=huggingface`, `HF_API_TOKEN`, `HF_MODEL_ID` (optionally `HF_API_BASE`, `HF_TEMPERATURE`)
4. Deploy! ✅

## 🔌 Model Provider Selection

You can switch the LLM provider without code changes using `LLM_PROVIDER` in `.env.local`:

- `openai` (default): uses `OPENAI_API_KEY` and `OPENAI_MODEL` for streaming chat via OpenAI SDK.
- `huggingface`: calls Hugging Face Inference API using `HF_API_TOKEN` and `HF_MODEL_ID`. The backend simulates streaming by chunking the generated text.

Recommended open-source models for `HF_MODEL_ID`:

- `meta-llama/Meta-Llama-3.1-8B-Instruct` (balanced quality/latency)
- `mistralai/Mixtral-8x7B-Instruct-v0.1` (higher quality, heavier)
- `HuggingFaceH4/zephyr-7b-beta` (lightweight instruct)

## 📖 How to Use

### 1. **Upload Your Documents**
- Click "Add Your First Document" or "Add Files"
- Select up to 100 documents (PDF, DOCX, PPTX, XLSX, CSV)
- Add a description of your document collection
- Large uploads are automatically chunked for reliability

### 1b. **Scan Documents (optional)**
- Use the "Scan" button to import:
  - Local folders via backend `/scan-folder`
  - Google Drive folders via `/api/ingest/drive` (requires access token or OAuth)
  - SMB shares via backend `/scan-smb` (dev/trusted environments only)

### 2. **Start Chatting**
- Ask questions about your documents in natural language
- Watch the 3-step process: Document Selection → Page Detection → Answer Generation
- Get detailed answers with timing and cost breakdowns

### 3. **Manage Your Collection**
- Add more documents anytime
- Edit collection descriptions
- Start new sessions as needed
- All data stays in your browser

## 🏗 Architecture Deep Dive

### Stateless Design
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Browser       │    │  Vercel Functions │    │   OpenAI API    │
│                 │    │                  │    │                 │
│ • LocalStorage  │◄──►│ • /api/upload    │◄──►│ • GPT Models    │
│ • Document Data │    │ • /api/chat/stream│    │ • Real-time     │
│ • Chat History  │    │ • No Storage     │    │   Processing    │
│ • Session State │    │ • Stateless      │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Chunked Upload System
When uploading large document sets:
1. **Size Detection**: Frontend calculates total upload size
2. **Automatic Chunking**: Splits into 3.5MB chunks if needed
3. **Parallel Processing**: Each chunk processed independently
4. **Progressive Results**: Documents become available as chunks complete
5. **Error Recovery**: Failed chunks can be retried individually

## 🔧 API Endpoints

### Vercel Serverless (Production)
- `POST /api/upload`
  - Upload and process documents (PDF/DOCX/PPTX/XLSX/CSV)
  - FormData with files and description; chunked uploads supported
- `POST /api/chat/stream`
  - Real-time SSE stream for document selection → page detection → answer generation
- `POST /api/ingest/drive`
  - Scan a Google Drive folder and return processed documents (requires token)
- `GET /api/health`
  - Service health info

### Local FastAPI (Development)
- `POST /upload`
  - Upload and process documents (no Vercel payload limits)
- `POST /chat/stream`
  - Real-time SSE stream (same contract as serverless)
- `POST /scan-folder`
  - Scan a local folder path for supported documents
- `POST /scan-smb`
  - Scan an SMB/CIFS share for supported documents (dev/trusted use only)

## 🎯 Advantages Over Traditional RAG

| Traditional RAG | Vectorless Approach |
|----------------|---------------------|
| 🗄️ Requires vector database | 🚫 No database needed |
| 📊 Pre-processes to embeddings | 🔄 Real-time processing |
| 💰 Expensive infrastructure | 💸 Serverless & cost-effective |
| 🔒 Stores data on servers | 🛡️ Browser-only storage |
| 📏 Limited by embedding dimensions | 🧠 Full context understanding |
| ⚡ Fast retrieval, lossy context | 🎯 Accurate reasoning, full context |

## 🌟 Example Workflow

1. **Upload**: Marketing team uploads 50 company documents
2. **Describe**: "Company policies, procedures, and guidelines"
3. **Ask**: "What is our remote work policy?"
4. **Process**:
   - 🧠 LLM selects "HR Handbook" and "Remote Work Guidelines"
   - 🎯 Identifies relevant pages about remote work
   - 💬 Generates comprehensive answer with citations
5. **Result**: Accurate answer in ~15 seconds with cost breakdown

## 🔮 Future Enhancements

- **Advanced Citations**: Highlight exact text passages
- **Collaboration Features**: Share sessions with team members
- **Analytics Dashboard**: Usage patterns and insights
- **Custom Models**: Support for local and custom LLMs
- **Batch Operations**: Process multiple questions simultaneously

## 🤝 Contributing

We welcome contributions! This project showcases how modern LLMs can replace traditional vector-based approaches while providing better accuracy and user experience.

## 📄 License

MIT License - see LICENSE file for details.

---

⭐ **Star us on GitHub** if you find this vectorless approach interesting!
