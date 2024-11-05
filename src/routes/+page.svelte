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
	let selectedLanguage = $state<string>('');

	const languages = [
		{ code: 'es', name: 'Spanish' },
		{ code: 'nl', name: 'Dutch' },
		{ code: 'pl', name: 'Polish' },
		{ code: 'fr', name: 'French' },
		{ code: 'de', name: 'German' },
		{ code: 'it', name: 'Italian' },
		{ code: 'pt', name: 'Portuguese' }
	];

	function extractTitles(obj: any): string[] {
		const titles = new Set<string>();

		function traverse(value: any) {
			if (typeof value === 'object' && value !== null) {
				const titleKey = Object.keys(value).find((key) => key.toLowerCase() === 'title');
				if (titleKey && typeof value[titleKey] === 'string') {
					titles.add(value[titleKey]);
				}
				for (let key in value) {
					traverse(value[key]);
				}
			}
		}

		traverse(obj);
		return Array.from(titles);
	}

	async function translateDisplayNames() {
		if (selectedLanguage === '') {
			alert('Please select a language');
			return;
		}

		if (!parsedJson || typeof parsedJson !== 'object' || parsedJson === null) {
			alert('Invalid JSON structure');
			return;
		}

		const titles = extractTitles(parsedJson);
		if (titles.length === 0) {
			alert('No titles found to translate');
			return;
		}

		const response = await fetch('/api/translate', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				titles: titles,
				targetLang: selectedLanguage
			})
		});

		if (response.ok) {
			const translations = await response.json();
			console.log({ translations });
			const updatedDisplayNames = { ...displayNames };

			Object.entries(translations).forEach(([originalTitle, translatedTitle]) => {
				if (originalTitle in updatedDisplayNames) {
					updatedDisplayNames[originalTitle].displayName = translatedTitle as string;
				}
			});

			displayNames = updatedDisplayNames;
			updateJsonWithTranslations(translations);
			// updateJsonDisplay() is now called inside updateJsonWithTranslations
		} else {
			alert('Translation failed. Please try again.');
		}
	}

	function updateJsonDisplay() {
		if (parsedJson && typeof parsedJson === 'object' && parsedJson !== null) {
			jsonInput = JSON.stringify(parsedJson, null, 2);
			if (jsonEditor) {
				jsonEditor.textContent = jsonInput;
			}
		}
	}

	function updateJsonWithTranslations(translations: Record<string, string>) {
		function traverse(obj: any) {
			if (typeof obj === 'object' && obj !== null) {
				const keys = Object.keys(obj);
				const titleKey = keys.find((k) => k.toLowerCase() === 'title');
				const displayNameKey = keys.find((k) => k.toLowerCase() === 'displayname');

				if (titleKey && typeof obj[titleKey] === 'string') {
					const title = obj[titleKey];
					if (title in translations) {
						keys.forEach((k) => {
							if (k.toLowerCase() === 'displayname') {
								delete obj[k];
							}
						});
						obj['displayName'] = translations[title].trim();
					}
				} else if (displayNameKey && typeof obj[displayNameKey] === 'string') {
					obj[displayNameKey] = obj[displayNameKey].trim();
				}
				for (const key of keys) {
					if (typeof obj[key] === 'object') {
						traverse(obj[key]);
					}
				}
			}
		}

		if (parsedJson) {
			traverse(parsedJson);
			jsonInput = JSON.stringify(parsedJson, null, 2);
			updateJsonDisplay();
		}
	}

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
				const title = obj[titleKey].trim();
				if (displayNames[title]) {
					// Use the existing display name if it's already been set
					obj['displayName'] = displayNames[title].displayName.trim();
				} else {
					// Otherwise, use the title as the default display name
					obj['displayName'] = title;
					// Add to displayNames state
					displayNames[title] = { title, displayName: title };
				}
			} else if (displayNameKey && typeof obj[displayNameKey] === 'string') {
				// Trim existing displayName values
				obj[displayNameKey] = obj[displayNameKey].trim();
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
		<div class="mb-4 flex space-x-4">
			<select
				bind:value={selectedLanguage}
				class="rounded bg-gray-700 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
			>
				<option value="">Select language</option>
				{#each languages as lang}
					<option value={lang.code}>{lang.name}</option>
				{/each}
			</select>
			<button
				onclick={translateDisplayNames}
				class="rounded bg-purple-500 px-4 py-2 text-white hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
			>
				Translate DisplayNames
			</button>
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
