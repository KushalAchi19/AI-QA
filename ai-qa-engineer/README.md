# 🚀 AI QA Engineer

An autonomous, AI-powered Quality Assurance platform that performs deep logic diagnostics, generates E2E test suites, and provides production-ready code corrections using **Gemini 2.5 Flash**.

---

## 🛠️ Prerequisites

Before starting, ensure you have the following installed:
- **Node.js** (v18 or higher)
- **npm** (v9 or higher)
- **Google Gemini API Key** (Get one at [aistudio.google.com](https://aistudio.google.com))

---

## ⚙️ Project Setup

### 1. Configure Backend Environment
Navigate to the `backend` directory and create a `.env` file (refer to `backend/.env.example`):

```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:5000
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE
GITHUB_WORKER_TOKEN=YOUR_GITHUB_PAT
GITHUB_CLIENT_ID=YOUR_GITHUB_OAUTH_CLIENT_ID
GITHUB_CLIENT_SECRET=YOUR_GITHUB_OAUTH_CLIENT_SECRET
SESSION_SECRET=your_session_secret
```

### 2. Configure Frontend Environment
In the `frontend` directory, create a `.env.local` file for local development:

```env
VITE_API_URL=http://localhost:5000
```

### 3. Install Dependencies
Install the required packages for both the backend and frontend:

```bash
# In backend
cd backend
npm install

# In frontend
cd ../frontend
npm install
```

---

## 🚀 Running the Project Locally

Run both the **Backend** and the **Frontend** simultaneously:

### Step 1: Start the Backend (API Engine)
Open a terminal and run:
```bash
cd backend
npm run dev
```
**LOCAL BACKEND:** `http://localhost:5000`

### Step 2: Start the Frontend (Dashboard)
Open a **new** terminal and run:
```bash
cd frontend
npm run dev
```
**LOCAL FRONTEND:** `http://localhost:5173`

The local frontend will communicate directly with `http://localhost:5000` via `frontend/.env.local`.

---

## ☁️ Cloud Deployment Configuration

The same codebase deploys cleanly to production without code changes:

### Vercel (Frontend)
- **Production URL:** `https://ai-quality-assurance-engineer.vercel.app`
- **Environment Variable in Vercel:**
  - `VITE_API_URL` = `https://ai-quality-assurance-engineer.onrender.com`

### Render (Backend)
- **Production URL:** `https://ai-quality-assurance-engineer.onrender.com`
- **Environment Variables in Render:**
  - `FRONTEND_URL` = `https://ai-quality-assurance-engineer.vercel.app`
  - `BACKEND_URL` = `https://ai-quality-assurance-engineer.onrender.com`
  - `PORT` = `3030` (or Render default)
  - `NODE_ENV` = `production`
  - `GEMINI_API_KEY` = `...`
  - `GITHUB_CLIENT_ID` = `...`
  - `GITHUB_CLIENT_SECRET` = `...`
  - `SESSION_SECRET` = `...`
  - `GITHUB_WORKER_TOKEN` = `...`

---

## 🍱 Key Features

- **🚩 Snippet Diagnostics**: Upload any source file (Java, Python, JS, etc.) to detect logic bugs and receive high-readability fixed code.
- **🔍 Repository Engine**: Connect GitHub URLs to generate autonomous **Playwright** test suites.
- **🚀 Pro Solution Boxes**: Real-time extraction of corrected code into a dedicated, copy-to-clipboard panel.
- **💎 Premium UI**: A glassmorphic dashboard built with **React**, **Tailwind CSS**, **Lucide Icons**, and **JetBrains Mono** typography.

---

## 🧪 Testing the AI
To test the platform, you can use a simple Java snippet like this:

```java
public class Calculator {
    public static void main(String[] args) {
        System.out.println(divide(10, 0)); // Division by Zero Error
    }
    public static int divide(int a, int b) {
        return a / b;
    }
}
```
Upload this in the **Snippet Diagnostics** mode to see the AI fix it!
