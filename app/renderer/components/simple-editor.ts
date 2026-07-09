export interface SimpleEditorState {
  filePath: string | null;
  fileName: string | null;
  content: string;
  originalContent: string;
  isDirty: boolean;
}

export function initSimpleEditor(): SimpleEditorState {
  return { filePath: null, fileName: null, content: '', originalContent: '', isDirty: false };
}

export function setFileContent(state: SimpleEditorState, filePath: string, fileName: string, content: string): SimpleEditorState {
  return { ...state, filePath, fileName, content, originalContent: content, isDirty: false };
}

export function updateContent(state: SimpleEditorState, newContent: string): SimpleEditorState {
  return { ...state, content: newContent, isDirty: newContent !== state.originalContent };
}

export function markSaved(state: SimpleEditorState): SimpleEditorState {
  return { ...state, originalContent: state.content, isDirty: false };
}
