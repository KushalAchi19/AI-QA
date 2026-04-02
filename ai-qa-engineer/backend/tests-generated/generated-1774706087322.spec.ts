import { test, expect } from '@playwright/test';

// Set a base URL for all tests. Ensure your app is running on http://localhost:3000
// You might want to use Playwright's webServer option in playwright.config.ts
// if you want Playwright to start your application automatically.
test.use({ baseURL: 'http://localhost:3000' });

test.describe('Notes App E2E Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the app before each test
    await page.goto('/');
    // Clear localStorage to ensure a clean state for each test
    await page.evaluate(() => localStorage.clear());
    await page.reload(); // Reload to apply localStorage.clear() effect
  });

  test('should load the application correctly with expected elements and empty state', async ({ page }) => {
    // Assert page title
    await expect(page).toHaveTitle(/Notes App/);

    // Assert main heading (assuming it's an h1 or similar)
    await expect(page.locator('h1')).toHaveText('My Notes');

    // Assert note input field is visible and enabled
    const noteInputField = page.locator('#note-input'); // Assuming id='note-input'
    await expect(noteInputField).toBeVisible();
    await expect(noteInputField).toBeEnabled();
    await expect(noteInputField).toHaveAttribute('placeholder', 'Enter your note here...');

    // Assert "Add Note" button is visible and enabled
    const addButton = page.locator('#add-note-btn'); // Assuming id='add-note-btn'
    await expect(addButton).toBeVisible();
    await expect(addButton).toBeEnabled();
    await expect(addButton).toHaveText('Add Note');

    // Assert 'No notes yet!' message is visible
    const noNotesMessage = page.locator('#no-notes-message'); // Assuming id='no-notes-message'
    await expect(noNotesMessage).toBeVisible();

    // Assert no notes are initially displayed
    await expect(page.locator('.note-item')).toHaveCount(0); // Assuming class='note-item' for individual notes
  });

  test('should allow adding a new note successfully', async ({ page }) => {
    const noteInputField = page.locator('#note-input');
    const addButton = page.locator('#add-note-btn');
    const noteText = 'My first important note!';

    // Type text into the input field
    await noteInputField.fill(noteText);
    // Click the Add Note button
    await addButton.click();

    // Assert the new note appears in the list
    const noteItem = page.locator('.note-item');
    await expect(noteItem).toBeVisible();
    await expect(noteItem).toHaveCount(1);
    await expect(noteItem.locator('.note-text')).toHaveText(noteText); // Assuming class='note-text' inside note-item

    // Assert the input field is cleared after adding the note
    await expect(noteInputField).toHaveValue('');

    // Assert 'No notes yet!' message is gone
    await expect(page.locator('#no-notes-message')).not.toBeVisible();
  });

  test('should allow adding multiple notes and display them', async ({ page }) => {
    const noteInputField = page.locator('#note-input');
    const addButton = page.locator('#add-note-btn');
    const note1 = 'Grocery list';
    const note2 = 'Meeting agenda';
    const note3 = 'Birthday reminder';

    // Add first note
    await noteInputField.fill(note1);
    await addButton.click();

    // Add second note
    await noteInputField.fill(note2);
    await addButton.click();

    // Add third note
    await noteInputField.fill(note3);
    await addButton.click();

    // Assert total number of notes
    const allNotes = page.locator('.note-item');
    await expect(allNotes).toHaveCount(3);

    // Assert each note's text content (assuming last added is first in list, or vice versa, adjust locator if needed)
    // Here we assume notes appear in the order they are added from top to bottom
    await expect(allNotes.nth(0).locator('.note-text')).toHaveText(note1);
    await expect(allNotes.nth(1).locator('.note-text')).toHaveText(note2);
    await expect(allNotes.nth(2).locator('.note-text')).toHaveText(note3);
  });

  test('should allow deleting a specific note', async ({ page }) => {
    const noteInputField = page.locator('#note-input');
    const addButton = page.locator('#add-note-btn');
    const noteToDelete = 'Task to be deleted';
    const noteToKeep = 'Important task to keep';

    // Add two notes
    await noteInputField.fill(noteToKeep);
    await addButton.click();
    await noteInputField.fill(noteToDelete);
    await addButton.click();

    // Assert two notes are present
    let allNotes = page.locator('.note-item');
    await expect(allNotes).toHaveCount(2);

    // Find the delete button for the specific note (assuming it's a child of .note-item)
    // Example: <div class="note-item"><span class="note-text">Text</span><button class="delete-note-btn">X</button></div>
    const deleteButton = page.locator(`.note-item:has-text("${noteToDelete}") .delete-note-btn`); // Assuming class='delete-note-btn'
    await expect(deleteButton).toBeVisible();

    // Click the delete button
    await deleteButton.click();

    // Assert the note is removed
    await expect(page.locator(`.note-item:has-text("${noteToDelete}")`)).not.toBeVisible();

    // Assert only one note remains and it's the correct one
    allNotes = page.locator('.note-item');
    await expect(allNotes).toHaveCount(1);
    await expect(allNotes.locator('.note-text')).toHaveText(noteToKeep);
  });

  test('should display "No notes yet!" message after deleting all notes', async ({ page }) => {
    const noteInputField = page.locator('#note-input');
    const addButton = page.locator('#add-note-btn');

    // Add a note
    await noteInputField.fill('Temporary note');
    await addButton.click();
    await expect(page.locator('.note-item')).toHaveCount(1);
    await expect(page.locator('#no-notes-message')).not.toBeVisible();

    // Delete the existing note
    const deleteButton = page.locator('.note-item .delete-note-btn');
    await deleteButton.click();

    // Assert no notes are present
    await expect(page.locator('.note-item')).toHaveCount(0);

    // Assert 'No notes yet!' message reappears
    await expect(page.locator('#no-notes-message')).toBeVisible();
  });

  test('should not add an empty note when input is empty', async ({ page }) => {
    const addButton = page.locator('#add-note-btn');

    // Click add button with empty input
    await addButton.click();

    // Assert no new note is added
    await expect(page.locator('.note-item')).toHaveCount(0);
    await expect(page.locator('#no-notes-message')).toBeVisible(); // Ensure empty message is still there
  });

  test('should persist notes after page reload (using localStorage)', async ({ page }) => {
    const noteInputField = page.locator('#note-input');
    const addButton = page.locator('#add-note-btn');
    const persistedNoteText = 'This note should persist!';

    // Add a note
    await noteInputField.fill(persistedNoteText);
    await addButton.click();
    await expect(page.locator('.note-item')).toHaveCount(1);
    await expect(page.locator('.note-item .note-text')).toHaveText(persistedNoteText);

    // Reload the page
    await page.reload();

    // Assert the note is still present after reload
    const noteItemAfterReload = page.locator('.note-item');
    await expect(noteItemAfterReload).toBeVisible();
    await expect(noteItemAfterReload).toHaveCount(1);
    await expect(noteItemAfterReload.locator('.note-text')).toHaveText(persistedNoteText);
    await expect(page.locator('#no-notes-message')).not.toBeVisible();
  });

});