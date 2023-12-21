import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  TextDocumentSyncKind,
  InitializeResult,
  TextDocumentChangeEvent,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import { useDefinition } from "./features/gotoDefinition";
import { mpxLocationMappingService } from "./common/mapping";
import { debounce } from "./common/utils";
import { useDocumentLinks } from "./features/addDocumentLink";

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

let projectRootpathSolve: (value: string) => void;
export const projectRootpathPromise: Promise<string> = new Promise(
  (resolve) => {
    return (projectRootpathSolve = resolve);
  }
);

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      /** 插件功能注册 */
      // 定义跳转
      definitionProvider: true,
      // 链接跳转（下划线）
      documentLinkProvider: {
        resolveProvider: true,
      },
      // // 自动补全
      // completionProvider: {
      //   resolveProvider: true,
      // },
    },
  };

  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.info("Workspace folder change event received.");
    });
  }

  connection.workspace
    .getWorkspaceFolders()
    .then((res) => {
      const root = res?.[0]?.uri;
      root && projectRootpathSolve(root);
      connection.console.info(`workspace root path: ${JSON.stringify(res)}`);
    })
    .catch((err) => {
      projectRootpathSolve(process.cwd() || "");
      connection.console.error(err);
    });

  connection.console.info("mpx-template-features initialized");
});

interface ExampleSettings {
  maxNumberOfProblems: number;
}

const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    documentSettings.clear();
  } else {
    globalSettings = <ExampleSettings>(
      (change.settings.MpxTemplateFeatures || defaultSettings)
    );
  }

  // Revalidate all open text documents
  // documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: "MpxTemplateFeatures",
    });
    documentSettings.set(resource, result);
  }
  return result;
}

documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri);
});

documents.onDidChangeContent((e) => {
  onDidChangeContentHandler(e);
});

const onDidChangeContentHandler = debounce(
  (e: TextDocumentChangeEvent<TextDocument>) => {
    const uri = e.document.uri;
    mpxLocationMappingService.refresh(uri, e.document);
  },
  200
);

useDefinition(connection, documents);
useDocumentLinks(connection, documents);
// useCompletion(connection);

connection.onDidChangeWatchedFiles((_change) => {
  connection.console.info("We received an file change event");
});
documents.listen(connection);
connection.listen();
