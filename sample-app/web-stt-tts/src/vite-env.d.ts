/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AZURE_OPENAI_ENDPOINT: string;
  readonly VITE_AZURE_OPENAI_API_KEY: string;
  readonly VITE_AZURE_OPENAI_STT_DEPLOYMENT: string;
  readonly VITE_AZURE_OPENAI_CHAT_DEPLOYMENT: string;
  readonly VITE_AZURE_OPENAI_TTS_DEPLOYMENT: string;
  readonly VITE_OPENAI_API_KEY: string;
  readonly VITE_OPENAI_STT_MODEL: string;
  readonly VITE_OPENAI_CHAT_MODEL: string;
  readonly VITE_OPENAI_TTS_MODEL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
