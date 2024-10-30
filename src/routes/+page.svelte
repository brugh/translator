<script lang="ts">
	type JsonPrimitive = string | number | boolean | null;
	type JsonValue = JsonPrimitive | JsonObject | JsonArray;
	type JsonObject = { [key: string]: JsonValue };
	type JsonArray = JsonValue[];

	type DisplayName = {
		title: string;
		displayName: string;
	};

	type DisplayNamesObject = {
		[title: string]: DisplayName;
	};

	let jsonInput = $state('');
	let parsedJson = $state<JsonValue | null>(null);
	let displayNames = $state<DisplayNamesObject>({});
	let selectedTitle = $state<string | null>(null);
	let jsonEditor: HTMLDivElement;
	let cursorPosition = 0;
	let previousLength = 0;
	let isBackspace = false;

	function extractDisplayNames(value: JsonValue) {
		if (Array.isArray(value)) {
			value.forEach((item) => extractDisplayNames(item));
		} else if (typeof value === 'object' && value !== null) {
			const obj = value as JsonObject;
			const titleKey = Object.keys(obj).find((k) => k.toLowerCase() === 'title');
			const displayNameKey = Object.keys(obj).find((k) => k.toLowerCase() === 'displayname');

			if (
				titleKey &&
				displayNameKey &&
				typeof obj[titleKey] === 'string' &&
				typeof obj[displayNameKey] === 'string'
			) {
				const title = obj[titleKey];
				displayNames[title] = {
					title,
					displayName: obj[displayNameKey]
				};
			}

			Object.values(obj).forEach((val) => extractDisplayNames(val));
		}
	}

	function updateJsonDisplay() {
		if (jsonEditor && typeof parsedJson === 'object' && parsedJson !== null) {
			let highlightedJson = JSON.stringify(parsedJson, null, 2);

			Object.entries(displayNames).forEach(([title, { displayName }]) => {
				const regex = new RegExp(
					`"(displayName|DisplayName)":\\s*"${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
					'g'
				);
				highlightedJson = highlightedJson.replace(regex, (match) => {
					return `"displayName": "<span class="cursor-pointer ${
						selectedTitle === title ? 'bg-yellow-200' : ''
					}" onclick="window.selectAndFocusInput('${title}')">${displayName}</span>"`;
				});
			});

			jsonEditor.innerHTML = highlightedJson;
		}
	}

	function selectAndFocusInput(title: string) {
		selectedTitle = title;
		updateJsonDisplay();
		const inputElement = document.getElementById(`input-${title}`) as HTMLInputElement | null;
		if (inputElement) {
			inputElement.focus();
			inputElement.select();
		}
	}

	function updateDisplayName(title: string, newValue: string) {
		if (displayNames[title]) {
			const oldValue = displayNames[title].displayName;
			displayNames[title].displayName = newValue;

			// Update all occurrences in the parsed JSON
			function updateJson(obj: JsonValue) {
				if (typeof obj === 'object' && obj !== null) {
					if (Array.isArray(obj)) {
						obj.forEach(updateJson);
					} else {
						for (const key in obj) {
							if (key.toLowerCase() === 'displayname' && obj[key] === oldValue) {
								obj[key] = newValue;
							} else if (typeof obj[key] === 'object') {
								updateJson(obj[key]);
							}
						}
					}
				}
			}

			updateJson(parsedJson);
			updateJsonDisplay();
		}
	}

	function parseJson(input: string) {
		try {
			const parsed = JSON.parse(input) as JsonValue;
			parsedJson = parsed;
			displayNames = {}; // Clear existing display names
			extractDisplayNames(parsed);
			updateJsonDisplay();
		} catch (error) {
			console.error('Error parsing JSON:', error);
		}
	}

	// Expose the function to the window object
	if (typeof window !== 'undefined') {
		(window as any).selectAndFocusInput = selectAndFocusInput;
	}

	function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (e) => {
				const content = e.target?.result as string;
				jsonInput = content;
				parseJson(content);
			};
			reader.readAsText(file);
		}
	}

	function handlePaste(event: ClipboardEvent) {
		event.preventDefault();
		const pastedText = event.clipboardData?.getData('text') || '';
		document.execCommand('insertText', false, pastedText);
		jsonInput = (event.target as HTMLDivElement).textContent || '';
		parseJson(jsonInput);
	}

	function saveCursorPosition() {
		const selection = window.getSelection();
		if (selection && selection.rangeCount > 0) {
			const range = selection.getRangeAt(0);
			cursorPosition = range.startOffset;
		}
	}
	function handleKeyDown(event: KeyboardEvent) {
		isBackspace = event.key === 'Backspace';
	}
	function handleJsonInputChange(event: Event) {
		const target = event.target as HTMLDivElement;
		const newContent = target.innerText;
		const isInsertion = newContent.length > previousLength;

		jsonInput = newContent;

		try {
			parsedJson = JSON.parse(jsonInput);
			displayNames = {}; // Clear existing display names
			extractDisplayNames(parsedJson);
			updateJsonDisplay();

			// Restore cursor position
			const selection = window.getSelection();
			if (selection && jsonEditor) {
				const range = document.createRange();
				if (jsonEditor.childNodes.length > 0) {
					const textNode = jsonEditor.childNodes[0];
					let newPosition;
					if (isInsertion) {
						newPosition = cursorPosition + (newContent.length - previousLength);
					} else if (isBackspace) {
						newPosition = Math.max(0, cursorPosition - 1);
					} else {
						newPosition = cursorPosition;
					}
					newPosition = Math.min(newPosition, textNode.textContent?.length || 0);
					range.setStart(textNode, newPosition);
					range.collapse(true);
					selection.removeAllRanges();
					selection.addRange(range);
				}
			}
		} catch (error) {
			console.error('Error parsing JSON:', error);
		}

		previousLength = newContent.length;
		isBackspace = false;
	}

	async function saveJsonToFile(event: MouseEvent) {
		if (!parsedJson) {
			alert('No valid JSON to save.');
			return;
		}

		const jsonString = JSON.stringify(parsedJson, null, 2);
		const blob = new Blob([jsonString], { type: 'application/json' });

		if ('showSaveFilePicker' in window) {
			try {
				const handle = await (window as any).showSaveFilePicker({
					suggestedName: 'data.json',
					types: [
						{
							description: 'JSON File',
							accept: { 'application/json': ['.json'] }
						}
					]
				});
				const writable = await handle.createWritable();
				await writable.write(blob);
				await writable.close();
			} catch (err: unknown) {
				if (err instanceof Error && err.name !== 'AbortError') {
					console.error('Failed to save file:', err);
					alert('Failed to save file. Please try again.');
				}
			}
		} else {
			// Fallback for browsers that don't support the File System Access API
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'data.json';
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		}
	}

	function addMissingDisplayNames(value: JsonValue): JsonValue {
		if (Array.isArray(value)) {
			return value.map((item) => addMissingDisplayNames(item));
		} else if (typeof value === 'object' && value !== null) {
			const obj = { ...(value as JsonObject) };
			const titleKey = Object.keys(obj).find((k) => k.toLowerCase() === 'title');
			const displayNameKey = Object.keys(obj).find((k) => k.toLowerCase() === 'displayname');

			if (titleKey && !displayNameKey && typeof obj[titleKey] === 'string') {
				const title = obj[titleKey];
				if (displayNames[title]) {
					// Use the existing display name if it's already been set
					obj['displayName'] = displayNames[title].displayName;
				} else {
					// Otherwise, use the title as the default display name
					obj['displayName'] = title;
					// Add to displayNames state
					displayNames[title] = { title, displayName: title };
				}
			}

			for (const key in obj) {
				obj[key] = addMissingDisplayNames(obj[key]);
			}

			return obj;
		}
		return value;
	}

	function handleAddMissingDisplayNames(event: MouseEvent) {
		if (parsedJson) {
			parsedJson = addMissingDisplayNames(parsedJson);
			jsonInput = JSON.stringify(parsedJson, null, 2);
			displayNames = {}; // Clear existing display names
			extractDisplayNames(parsedJson);
			updateJsonDisplay();
		}
	}

	$effect(() => {
		(window as any).selectAndFocusInput = selectAndFocusInput;
	});
</script>

<div class="flex h-screen flex-col bg-gray-900 text-gray-100">
	<div class="p-4">
		<h2 class="mb-4 text-xl font-bold text-gray-100">JSON Display Name Editor</h2>
		<div class="mb-4 flex space-x-4">
			<button
				onclick={handleAddMissingDisplayNames}
				class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
			>
				Add Missing DisplayNames
			</button>
			<button
				onclick={saveJsonToFile}
				class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
			>
				Save Changes
			</button>
			<label
				for="file-upload"
				class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
			>
				Choose File
			</label>
			<input
				id="file-upload"
				type="file"
				accept=".json"
				onchange={handleFileUpload}
				class="hidden"
			/>
		</div>
	</div>

	<div class="flex h-screen flex-col bg-gray-900 text-gray-100">
		<div class="flex flex-1 overflow-hidden">
			<div class="w-1/2 overflow-y-auto p-4">
				<h3 class="mb-4 text-lg font-bold text-gray-100">Edit Display Names</h3>

				{#each Object.entries(displayNames) as [title, { displayName }]}
					<div class="mb-4">
						<label for={`input-${title}`} class="block text-sm font-medium text-gray-300">
							{title}
						</label>
						<input
							id={`input-${title}`}
							type="text"
							value={displayName}
							onfocus={() => selectAndFocusInput(title)}
							oninput={(e) => updateDisplayName(title, (e.target as HTMLInputElement).value)}
							class="mt-1 block w-full rounded-md border-gray-700 bg-gray-800 text-gray-100 focus:border-indigo-500 focus:ring focus:ring-indigo-500 focus:ring-opacity-50"
						/>
					</div>
				{/each}
			</div>
			<div class="w-1/2 p-4">
				<h3 class="mb-4 text-lg font-bold text-gray-100">JSON Input</h3>
				<div
					bind:this={jsonEditor}
					role="textbox"
					tabindex="0"
					aria-multiline="true"
					aria-label="JSON Input"
					contenteditable="true"
					oninput={handleJsonInputChange}
					onkeydown={handleKeyDown}
					onkeyup={saveCursorPosition}
					onclick={saveCursorPosition}
					onpaste={handlePaste}
					class="h-full w-full overflow-auto whitespace-pre rounded border border-gray-700 bg-gray-800 p-2 text-gray-100"
				>
					{jsonInput}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	:global(body) {
		background-color: #1a202c; /* dark background */
		color: #f7fafc; /* light text */
	}

	:global(.bg-yellow-200) {
		background-color: #4a5568 !important; /* darker highlight for better contrast */
		color: #f7fafc !important;
	}
</style>
