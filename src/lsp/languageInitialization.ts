/**
 * Language-specific initialization options and handlers for LSP servers
 */

import { getFSharpInitializationOptions, postInitializeFSharp } from "../fsharp/fsharpInit.ts";

type SendRequestFunction = <T = unknown>(method: string, params?: unknown) => Promise<T>;
type SendNotificationFunction = (method: string, params?: unknown) => void;

export interface LanguageInitializationOptions {
  initializationOptions?: unknown;
  postInitialize?: (sendRequest: SendRequestFunction, sendNotification: SendNotificationFunction, rootPath: string) => Promise<void>;
}

/**
 * Get language-specific initialization options
 */
export function getLanguageInitialization(languageId: string): LanguageInitializationOptions {
  switch (languageId) {
    case "deno":
      return {
        initializationOptions: {
          enable: true,
          lint: true,
          unstable: true,
        }
      };
      
    case "fsharp":
    case "f#":
      return {
        initializationOptions: getFSharpInitializationOptions(),
        postInitialize: postInitializeFSharp,
      };
      
    default:
      return {};
  }
}