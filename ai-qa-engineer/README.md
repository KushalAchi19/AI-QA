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
Navigate to the `backend` directory and create a `.env` file:

```bash
cd backend
# Create or edit .env
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE
PORT=5000
```

### 2. Install Dependencies
Install the required packages for both the backend and frontend:

```bash
# In backend
cd backend
npm install

# In frontend
cd ../frontend
npm install

# 3. Configure Frontend Environment
Create a `.env` file in the `frontend` directory with:
```bash
VITE_API_URL=https://ai-quality-assurance-engineer.onrender.com
```
```

---

## 🚀 Running the Project

You need to run both the **Backend** and the **Frontend** simultaneously.

### Step 1: Start the Backend (API Engine)
Open a terminal and run:
```bash
cd backend
npm run dev
```
The backend will start at `https://ai-quality-assurance-engineer.onrender.com`.

### Step 2: Start the Frontend (Dashboard)
Open a **new** terminal and run:
```bash
cd frontend
npm run dev
```
The dashboard will start at `http://localhost:5173`.

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
