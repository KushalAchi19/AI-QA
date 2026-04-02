import { test, expect, Page } from '@playwright/test';

// Define a helper function to clear localStorage and reload the page
async function clearLocalStorageAndReload(page: Page) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
}

test.describe('Elite Notes App E2E Tests', () => {
    // Before each test, navigate to the base URL and ensure localStorage is clean
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3030');
        await clearLocalStorageAndReload(page);
    });

    // Test: Initial state - no notes displayed
    test('should display no notes initially if localStorage is empty', async ({ page }) => {
        const notesContainer = page.locator('#notes');
        await expect(notesContainer).toBeEmpty();
    });

    // Test: Adding a single note
    test('should add and display a new note', async ({ page }) => {
        const noteInput = page.locator('#noteInput');
        const addButton = page.locator('button');
        const noteText = 'My first important note!';

        // Enter note text and click add button
        await noteInput.fill(noteText);
        await addButton.click();

        // Expect the input to be cleared
        await expect(noteInput).toHaveValue('');

        // Expect the note to be displayed in the notes grid
        const noteCard = page.locator('.note p');
        await expect(noteCard).toHaveText(noteText);
        await expect(noteCard).toBeVisible();
    });

    // Test: Adding multiple notes
    test('should add and display multiple notes correctly', async ({ page }) => {
        const noteInput = page.locator('#noteInput');
        const addButton = page.locator('button');
        const notes = ['Note A', 'Note B', 'Note C'];

        for (const text of notes) {
            await noteInput.fill(text);
            await addButton.click();
        }

        // Expect all notes to be displayed
        const noteCards = page.locator('.note p');
        await expect(noteCards).toHaveCount(notes.length);
        await expect(noteCards.nth(0)).toHaveText(notes[0]);
        await expect(noteCards.nth(1)).toHaveText(notes[1]);
        await expect(noteCards.nth(2)).toHaveText(notes[2]);
    });

    // Test: Persistence of notes after refresh
    test('should persist notes after page refresh', async ({ page }) => {
        const noteInput = page.locator('#noteInput');
        const addButton = page.locator('button');
        const noteText = 'This note should persist!';

        await noteInput.fill(noteText);
        await addButton.click();

        // Reload the page
        await page.reload();
        await page.waitForLoadState('domcontentloaded');

        // Expect the note to still be displayed
        const noteCard = page.locator('.note p');
        await expect(noteCard).toHaveText(noteText);
        await expect(noteCard).toBeVisible();
    });

    // Test: Editing an existing note
    test('should edit an existing note', async ({ page }) => {
        const noteInput = page.locator('#noteInput');
        const addButton = page.locator('button');
        const originalNote = 'Original content';
        const updatedNote = 'Updated content for the note.';

        // Add an original note
        await noteInput.fill(originalNote);
        await addButton.click();

        // Click the edit icon (✏️) for the first note
        const editButton = page.locator('.note .actions span:nth-child(1)'); // The first span is edit
        await editButton.click();

        // Mock the prompt dialog and enter new text
        page.on('dialog', async dialog => {
            expect(dialog.type()).toEqual('prompt');
            expect(dialog.defaultValue()).toEqual(originalNote);
            await dialog.accept(updatedNote);
        });

        // Expect the note to show the updated text
        const noteCard = page.locator('.note p');
        await expect(noteCard).toHaveText(updatedNote);

        // Verify persistence after refresh
        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('.note p')).toHaveText(updatedNote);
    });

    // Test: Deleting a note
    test('should delete an existing note', async ({ page }) => {
        const noteInput = page.locator('#noteInput');
        const addButton = page.locator('button');
        const note1 = 'Note to keep';
        const note2 = 'Note to delete';
        const note3 = 'Another note to keep';

        // Add multiple notes
        await noteInput.fill(note1); await addButton.click();
        await noteInput.fill(note2); await addButton.click();
        await noteInput.fill(note3); await addButton.click();

        // Expect 3 notes initially
        let noteCards = page.locator('.note p');
        await expect(noteCards).toHaveCount(3);

        // Click the delete icon (❌) for the second note (index 1)
        const deleteButton = page.locator('.note:nth-child(2) .actions span:nth-child(2)'); // Second note, second span is delete
        await deleteButton.click();

        // Expect 2 notes remaining
        noteCards = page.locator('.note p');
        await expect(noteCards).toHaveCount(2);
        await expect(noteCards.nth(0)).toHaveText(note1);
        await expect(noteCards.nth(1)).toHaveText(note3);

        // Verify persistence after refresh
        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        noteCards = page.locator('.note p');
        await expect(noteCards).toHaveCount(2);
        await expect(noteCards.nth(0)).toHaveText(note1);
        await expect(noteCards.nth(1)).toHaveText(note3);
    });

    // Test: Search functionality - filter notes
    test('should filter notes based on search query', async ({ page }) => {
        const noteInput = page.locator('#noteInput');
        const addButton = page.locator('button');
        const searchInput = page.locator('#search');

        // Add notes with distinct keywords
        await noteInput.fill('Apple is red'); await addButton.click();
        await noteInput.fill('Banana is yellow'); await addButton.click();
        await noteInput.fill('Orange is orange'); await addButton.click();
        await noteInput.fill('Applesauce is tasty'); await addButton.click();

        // Search for 'apple'
        await searchInput.fill('apple');

        // Expect only 'Apple is red' and 'Applesauce is tasty'
        const visibleNotes = page.locator('.note p');
        await expect(visibleNotes).toHaveCount(2);
        await expect(visibleNotes.nth(0)).toHaveText('Apple is red');
        await expect(visibleNotes.nth(1)).toHaveText('Applesauce is tasty');

        // Clear search
        await searchInput.clear();
        await expect(visibleNotes).toHaveCount(4); // All notes should reappear
    });

    // Test: Search functionality - no matching notes
    test('should display no notes when search query does not match', async ({ page }) => {
        const noteInput = page.locator('#noteInput');
        const addButton = page.locator('button');
        const searchInput = page.locator('#search');

        await noteInput.fill('Unique note 1'); await addButton.click();
        await noteInput.fill('Unique note 2'); await addButton.click();

        await searchInput.fill('nonexistent');

        const notesContainer = page.locator('#notes');
        await expect(notesContainer).toBeEmpty();
    });

    // Test: Edge case - adding an empty note
    test('should not add an empty note', async ({ page }) => {
        const noteInput = page.locator('#noteInput');
        const addButton = page.locator('button');

        // Try to add empty string
        await noteInput.fill('');
        await addButton.click();
        await expect(page.locator('.note')).toHaveCount(0);

        // Try to add only spaces
        await noteInput.fill('   ');
        await addButton.click();
        await expect(page.locator('.note')).toHaveCount(0);
    });

    // Test: Edge case - editing a note to an empty string or cancelling
    test('should not update note if edit prompt is empty or cancelled', async ({ page }) => {
        const noteInput = page.locator('#noteInput');
        const addButton = page.locator('button');
        const originalNote = 'Note to edit';

        await noteInput.fill(originalNote);
        await addButton.click();

        const editButton = page.locator('.note .actions span:nth-child(1)');

        // Scenario 1: Edit with empty string
        page.on('dialog', async dialog => {
            await dialog.accept(''); // User enters empty string
        });
        await editButton.click();
        // The current implementation correctly handles `trim() !== ""` so it should NOT update.
        await expect(page.locator('.note p')).toHaveText(originalNote);

        // Scenario 2: Edit with only spaces
        page.on('dialog', async dialog => {
            await dialog.accept('   '); // User enters only spaces
        });
        await editButton.click();
        await expect(page.locator('.note p')).toHaveText(originalNote); // Should still be original

        // Scenario 3: Cancel edit
        page.on('dialog', async dialog => {
            await dialog.cancel();
        });
        await editButton.click();
        await expect(page.locator('.note p')).toHaveText(originalNote); // Should still be original
    });

    // Test: Displaying a note with special characters
    test('should display notes containing special characters safely', async ({ page }) => {
        const noteInput = page.locator('#noteInput');
        const addButton = page.locator('button');
        // Malicious script tag will be rendered as text, not executed due to fix.
        const specialNote = 'Special chars: & < > " \' / ` ~ ! @ # $ % ^ & * ( ) _ + - = { } [ ] | \\ ; : " \' , . ? / and <script>alert("XSS")</script>';

        await noteInput.fill(specialNote);
        await addButton.click();

        const noteCard = page.locator('.note p');
        await expect(noteCard).toHaveText(specialNote); // Verifies text content, not innerHTML interpretation
        // Further verification could involve checking the raw DOM for script tags,
        // buttoHaveText implicitly verifies content is treated as text.
    });
});