const vscode = require("vscode");
const path = require("path");

function activate(context) {
  let disposable = vscode.commands.registerCommand("mdPreview.openPreview", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active Markdown file to preview.");
      return;
    }

    const document = editor.document;
    if (document.languageId !== "markdown") {
      vscode.window.showErrorMessage("Open a Markdown file to preview.");
      return;
    }

    // Create a new webview panel
    const panel = vscode.window.createWebviewPanel(
      "mdPreview",
      "Markdown Preview",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, "media")),
          vscode.Uri.file(path.dirname(document.uri.fsPath)), // Allow images from Markdown directory
        ],
        retainContextWhenHidden: true, // Keeps state when switching tabs
      }
    );

    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(context.extensionPath, "media", "marked.min.js"))
    );
    const cssUri = panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(context.extensionPath, "media", "styles.css"))
    );

    const savedTheme = context.workspaceState.get("mdPreviewTheme") || "light";
    panel.webview.html = getWebviewContent(document.getText(), scriptUri, cssUri, savedTheme, panel, document.uri);

    // Function to update preview content
    const updatePreview = (e) => {
      if (e.document === document) {
        panel.webview.html = getWebviewContent(e.document.getText(), scriptUri, cssUri, savedTheme, panel, document.uri);
      }
    };

    const textChangeListener = vscode.workspace.onDidChangeTextDocument(updatePreview);

    // Handle messages from webview
    panel.webview.onDidReceiveMessage((message) => {
      if (message.command === "saveTheme") {
        context.workspaceState.update("mdPreviewTheme", message.theme);
      }
    });

    // Clean up when panel is closed
    panel.onDidDispose(() => {
      textChangeListener.dispose();
    });
  });

  context.subscriptions.push(disposable);
}

function getWebviewContent(mdContent, scriptUri, cssUri, theme, panel, documentUri) {
  const processedMdContent = mdContent.replace(/!\[(.*?)\]\((.*?)\)/g, (match, altText, imagePath) => {
    if (imagePath.startsWith("http")) {
      return match; // Keep external links unchanged
    }
    
    try {
      // Resolve relative image paths based on the Markdown file location
      const imageUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(documentUri, "..", imagePath));
      return `![${altText}](${imageUri})`;
    } catch (error) {
      console.error("Error processing image path:", imagePath, error);
      return match;
    }
  });

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${cssUri}">
    <script src="${scriptUri}"></script>
    <title>Markdown Preview</title>
  </head>
  <body class="${theme}-theme">
    <div id="toolbar">
      <span><strong>MD Preview</strong></span>
      <select id="themeSelector">
        <option value="light" ${theme === "light" ? "selected" : ""}>Light Theme</option>
        <option value="dark" ${theme === "dark" ? "selected" : ""}>Dark Theme</option>
      </select>
    </div>
    <div id="content"></div>

    <script>
      const vscode = acquireVsCodeApi();
      document.getElementById('content').innerHTML = marked.parse(${JSON.stringify(processedMdContent)});

      document.getElementById('themeSelector').addEventListener('change', (event) => {
        document.body.className = event.target.value + "-theme";
        vscode.postMessage({ command: "saveTheme", theme: event.target.value });
      });

      // Apply saved theme on reload
      vscode.postMessage({ command: "saveTheme", theme: "${theme}" });
    </script>
  </body>
  </html>`;
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
