# AI QA Engineer: Feature Roadmap

As the AI QA Engineer transitions from an academic project into an industry-ready product, there are several high-impact features that can be implemented to improve utility, security, and the overall user experience.

---

## 1. Enterprise & Security Features (MVP Hardening)

These features are essential for a product that is exposed to real users and handles proprietary code.

*   **GitHub Authentication (OAuth):** Allow users to securely log in to the dashboard instead of using local browser storage for their "Client ID". This enables a persistent, cross-device experience.
*   **Private Repository Support:** Currently, the Repository Engine primarily relies on public URLs. Adding GitHub App integrations or Personal Access Token (PAT) support will allow it to securely analyze private, proprietary repositories.
*   **Rate Limiting & Abuse Prevention:** To prevent unexpected AI API billing spikes, implement basic rate limiting (e.g., maximum of 50 diagnostic runs per user per day on the free tier).

---

## 2. Core QA Functionality Upgrades

These features directly enhance the value the AI agent provides to software engineering teams.

*   **Framework Selection Dropdown:** Instead of defaulting exclusively to Playwright, provide a dropdown in the UI allowing users to select their preferred testing framework (e.g., Cypress, Selenium, Jest, PyTest) before running the Repository Engine.
*   **CI/CD Pipeline Generator:** Add a feature that automatically generates the corresponding CI/CD configuration files (like `.github/workflows/test.yml` or `gitlab-ci.yml`) based on the generated tests. Developers can simply copy-paste this into their repositories.
*   **Autonomous Test Auto-Retry (Agentic Loop):** Implement an advanced loop where if an AI-generated test fails on the first run (e.g., due to a flaky CSS selector), the agent automatically reads the failure logs, rewrites the code to fix the selector, and runs it again before presenting the final result.

---

## 3. Product Experience (UX) & Collaboration

These features focus on making the product "sticky" and easy for teams to adopt.

*   **Project Workspaces / Folders:** Instead of a single continuous list of "Audit History," allow users to organize their reports by specific repositories, clients, or team projects.
*   **Email Notifications:** Because large repository analyses can take several minutes, add an option for users to receive an email notification (with the PDF report attached) once the diagnostic scan is complete.
*   **Shareable Public Links:** Generate unique, read-only links (e.g., `ai-qa.app/report/abc-123`) so a developer can easily share a specific diagnostic report and test suite with a team member over Slack or Teams.
