import { test, expect } from '@playwright/test';

// Assume the application is running on http://localhost:3000
const BASE_URL = 'http://localhost:3000';

test.describe('Notes App E2E Tests', () => {

  // Before each test, navigate to the base URL
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    // Clear localStorage to ensure a clean state for each test, if the app uses it for persistence.
    // This is a common practice for reliable E2E tests involving client-side storage.
    await page.evaluate(() => localStorage.clear());
    await page.reload(); // Reload to apply the cleared local storage state
  });

  test('should load the application and display initial elements', async ({ page }) => {
    // Assert page title
    await expect(page).toHaveTitle(/Notes App/i); // Adjust regex based on actual title

    // Assert the main heading or a prominent text is visible
    await expect(page.locator('h1')).toHaveText(/Notes App/i); // Assuming an H1 exists

    // Assert the note input field is visible and enabled
    const noteInput = page.locator('#noteInput'); // Assuming id='noteInput'
    await expect(noteInput).toBeVisible();
    await expect(noteInput).toBeEnabled();
    await expect(noteInput).toHaveAttribute('placeholder', 'Add a new note...'); // Check placeholder

    // Assert the 'Add Note' button is visible and enabled
    const addButton = page.locator('#addNoteBtn'); // Assuming id='addNoteBtn'
    await expect(addButton).toBeVisible();
    await expect(addButton).toBeEnabled();
    await expect(addButton).toHaveText('Add Note');

    // Assert that initially, there are no notes displayed
    const noteList = page.locator('#noteList'); // Assuming id='noteList'
    await expect(noteList).toBeEmpty();
  });

  test('should add a new note successfully', async ({ page }) => {
    const noteText = 'My first important note!';
    const noteInput = page.locator('#noteInput');
    const addButton = page.locator('#addNoteBtn');
    const noteList = page.locator('#noteList');

    // Type text into the input field
    await noteInput.fill(noteText);
    await expect(noteInput).toHaveValue(noteText); // Verify input value

    // Click the Add Note button
    await addButton.click();

    // Assert that the input field is cleared after adding the note
    await expect(noteInput).toHaveValue('');

    // Assert that the note is displayed in the list
    const firstNoteItem = noteList.locator('li').first(); // Assuming notes are li elements
    await expect(firstNoteItem).toBeVisible();
    await expect(firstNoteItem.locator('.note-text')).toHaveText(noteText); // Assuming class='note-text' inside li
    
    // Assert that the note item contains edit and delete buttons
    await expect(firstNoteItem.locator('.edit-btn')).toBeVisible(); // Assuming class='edit-btn'
    await expect(firstNoteItem.locator('.delete-btn')).toBeVisible(); // Assuming class='delete-btn'
  });

  test('should persist notes after page reload', async ({ page }) => {
    const noteText = 'Note that should persist';
    const noteInput = page.locator('#noteInput');
    const addButton = page.locator('#addNoteBtn');
    const noteList = page.locator('#noteList');

    // Add a note
    await noteInput.fill(noteText);
    await addButton.click();
    await expect(noteList.locator('li')).toHaveCount(1); // Verify one note is added

    // Reload the page
    await page.reload();

    // Assert that the note is still present after reload
    const persistedNoteItem = noteList.locator('li').first();
    await expect(persistedNoteItem).toBeVisible();
    await expect(persistedNoteItem.locator('.note-text')).toHaveText(noteText);
  });

  test('should edit an existing note', async ({ page }) => {
    const originalNoteText = 'Note to be edited';
    const updatedNoteText = 'This note has been updated!';
    const noteInput = page.locator('#noteInput');
    const addButton = page.locator('#addNoteBtn');
    const noteList = page.locator('#noteList');

    // Add a note first
    await noteInput.fill(originalNoteText);
    await addButton.click();
    
    const firstNoteItem = noteList.locator('li').first();
    await expect(firstNoteItem.locator('.note-text')).toHaveText(originalNoteText);

    // Click the Edit button for the first note
    await firstNoteItem.locator('.edit-btn').click(); // Assuming class='edit-btn'

    // Assert that the note text converts to an input field and pre-fills
    const editInputField = firstNoteItem.locator('.edit-note-input'); // Assuming class='edit-note-input'
    await expect(editInputField).toBeVisible();
    await expect(editInputField).toHaveValue(originalNoteText);

    // Change the text in the edit input
    await editInputField.fill(updatedNoteText);

    // Click the Save button
    await firstNoteItem.locator('.save-btn').click(); // Assuming class='save-btn'

    // Assert that the note text is updated and the input field is gone
    const updatedNoteTextElement = firstNoteItem.locator('.note-text');
    await expect(updatedNoteTextElement).toBeVisible();
    await expect(updatedNoteTextElement).toHaveText(updatedNoteText);
    await expect(editInputField).not.toBeVisible(); // The input should be replaced by the text again
  });

  test('should delete an existing note', async ({ page }) => {
    const noteText1 = 'Note to delete';
    const noteText2 = 'Another note';
    const noteInput = page.locator('#noteInput');
    const addButton = page.locator('#addNoteBtn');
    const noteList = page.locator('#noteList');

    // Add two notes
    await noteInput.fill(noteText1);
    await addButton.click();
    await noteInput.fill(noteText2);
    await addButton.click();
    await expect(noteList.locator('li')).toHaveCount(2);

    // Locate the first note item (the one to delete)
    const firstNoteItem = noteList.locator('li').filter({ hasText: noteText1 }).first();
    await expect(firstNoteItem).toBeVisible();

    // Click the Delete button for the first note
    await firstNoteItem.locator('.delete-btn').click(); // Assuming class='delete-btn'

    // Assert that the note is no longer in the list
    await expect(firstNoteItem).not.toBeVisible();
    await expect(noteList.locator('li')).toHaveCount(1); // Should only have one note left
    
    // Assert that the remaining note is the correct one
    await expect(noteList.locator('li').first().locator('.note-text')).toHaveText(noteText2);
  });

  test('should not add an empty note', async ({ page }) => {
    const noteInput = page.locator('#noteInput');
    const addButton = page.locator('#addNoteBtn');
    const noteList = page.locator('#noteList');

    // Ensure input is empty
    await noteInput.fill('');
    await expect(noteInput).toHaveValue('');

    // Click the Add Note button
    await addButton.click();

    // Assert that no note was added to the list
    await expect(noteList).toBeEmpty();
    await expect(noteList.locator('li')).toHaveCount(0);
  });

});