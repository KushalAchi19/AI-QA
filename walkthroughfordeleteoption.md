# Walkthrough - Analysis History Deletion

You can now manage your analysis history by deleting individual runs directly from the sidebar.

## Key Features

### 🗑️ Individual Deletion
Beside the status badge of every analysis in the **History Sidebar**, you will now find a **Trash Icon**. Clicking this will trigger a confirmation prompt to prevent accidental deletions.

### 🔄 Automatic State Cleanup
- When you delete an analysis, it is immediately removed from the list.
- If you are currently viewing the analysis you just deleted, the **Detail Panel** will automatically clear to "Select an analysis to inspect."

### 💾 Persistent Backend Sync
The deletion is synchronized with the backend:
- The `DELETE /api/analyses/:id` endpoint removes the record from the `ai-qa.json` database.
- Even after a page refresh, the deleted item will not reappear.

## Implementation Details

### [Backend] [database.ts](file:///c:/Users/kusha/OneDrive/Desktop/ai-qa/ai-qa-engineer/backend/services/database.ts)
- Added `deleteAnalysis(id)` to filter the array and save the file.

### [Backend] [server.ts](file:///c:/Users/kusha/OneDrive/Desktop/ai-qa/ai-qa-engineer/backend/server.ts)
- Added the `DELETE /api/analyses/:id` route for frontend communication.

### [Frontend] [App.tsx](file:///c:/Users/kusha/OneDrive/Desktop/ai-qa/ai-qa-engineer/frontend/src/App.tsx)
- Added `handleDeleteRun` to handle the API call and `setRuns` state update.
- Used `e.stopPropagation()` on the trash icon to ensure clicking delete doesn't select the run before it's removed.
