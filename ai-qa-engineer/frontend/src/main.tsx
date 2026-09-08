// ============================================================================
// FRONTEND ENTRY POINT: main.tsx
// This file is the primary entry point for the React 19 frontend application.
// It initializes the React DOM root, applies global Tailwind styles,
// wraps the application in an ErrorBoundary for crash protection,
// and renders the core App component in React StrictMode.
// ============================================================================

// Import StrictMode from React.
// WHAT: A development helper component that checks for common bugs, deprecated APIs, and unexpected side effects.
// WHY: Ensures code conforms to React 19 best practices by intentionally double-invoking certain hooks in development.
// HOW: Wraps the top-level `<ErrorBoundary>` and `<App />` tree.
import { StrictMode } from 'react'

// Import createRoot from react-dom/client.
// WHAT: Modern React DOM initialization method for React 18/19 concurrent rendering.
// WHY: Replaces legacy ReactDOM.render() to enable concurrent rendering features and smoother UI updates.
// HOW: Targets the DOM container with ID 'root' located in `frontend/index.html`.
import { createRoot } from 'react-dom/client'

// Import global CSS styling rules.
// WHAT: Imports Tailwind CSS directives, typography rules, glassmorphism styles, and custom animations.
// WHY: Provides global visual styling across the entire dashboard.
// HOW: Injected into the browser DOM at bundle load time.
import './index.css'

// Import the main application dashboard component.
// WHAT: The root component containing the navigation, GitHub engine, snippet diagnostics, and report views.
// WHY: Serves as the central user interface of the platform.
import App from './App.tsx'

// Import the top-level ErrorBoundary component.
// WHAT: A React class component that catches uncaught JavaScript errors anywhere in the child component tree.
// WHY: Prevents the entire screen from turning blank ("white screen of death") if an unexpected error occurs during rendering.
import ErrorBoundary from './ErrorBoundary.tsx'

// ----------------------------------------------------------------------------
// ROOT RENDERING
// ----------------------------------------------------------------------------

// Find the HTML element with id="root" and mount the React application inside it.
// WHAT: `document.getElementById('root')!` retrieves the root container from index.html (the exclamation mark asserts non-null in TypeScript).
// WHY: Connects the virtual React component tree to the actual browser DOM.
// HOW: Calls `.render()` passing the wrapped `<App />` element.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
