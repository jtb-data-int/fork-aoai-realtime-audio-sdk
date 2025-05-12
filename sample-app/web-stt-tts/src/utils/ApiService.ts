/**
 * API Service for handling STT, Chat, and TTS operations
 */

// STTとChatは07エンドポイントを使用
const endpoint07 = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT_07 || '';
const apiKey07 = import.meta.env.VITE_AZURE_OPENAI_API_KEY_07 || '';

// TTSは04エンドポイントを使用
const endpoint04 = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT_04 || '';
const apiKey04 = import.meta.env.VITE_AZURE_OPENAI_API_KEY_04 || '';

// 共通のヘッダー関数
const getHeaders = (key: string) => {
  return {
    'Content-Type': 'application/json',
    'api-key': key,
  };
};

/**
 * Transcribes audio to text using Azure OpenAI STT (gpt-4o-mini-transcribe)
 */
export async function transcribeAudio(audioBuffer: ArrayBuffer): Promise<string> {
  try {
    const deployment = import.meta.env.VITE_AZURE_OPENAI_STT_DEPLOYMENT;
    
    // Create form data with audio
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', deployment);
    
    // エンドポイント07を使用
    const url = `${endpoint07}/openai/deployments/${deployment}/audio/transcriptions?api-version=2025-03-01-preview`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': apiKey07,
      },
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Transcription failed: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.text;
  } catch (error) {
    console.error('Error in transcription:', error);
    throw error;
  }
}

/**
 * Gets response from GPT for the given message
 */
export async function getChatResponse(
  message: string, 
  systemMessage: string = ''
): Promise<string> {
  try {
    const deployment = import.meta.env.VITE_AZURE_OPENAI_CHAT_DEPLOYMENT;
    // エンドポイント07を使用
    const url = `${endpoint07}/openai/deployments/${deployment}/chat/completions?api-version=2025-03-01-preview`;
    
    const payload = {
      messages: [
        {
          role: "system",
          content: systemMessage
        },
        {
          role: "user",
          content: message
        }
      ],
      max_tokens: 800,
      stream: false
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(apiKey07),
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.choices[0].message.content;
  } catch (error) {
    console.error('Error in chat response:', error);
    throw error;
  }
}

/**
 * Converts text to speech using Azure OpenAI TTS-1 model
 */
export async function textToSpeech(text: string, voice: string = 'alloy'): Promise<ArrayBuffer> {
  try {
    const deployment = import.meta.env.VITE_AZURE_OPENAI_TTS_DEPLOYMENT;
    
    // tts-1モデルのAPIエンドポイント - エンドポイント04を使用
    const url = `${endpoint04}/openai/deployments/${deployment}/audio/speech?api-version=2025-03-01-preview`;
    
    // tts-1モデルに合わせたリクエストボディ
    const payload = {
      model: import.meta.env.VITE_AZURE_OPENAI_TTS_DEPLOYMENT,
      input: text,
      voice: voice
    };
    
    console.log('Sending TTS request to:', url);
    console.log('TTS payload:', payload);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(apiKey04),
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('TTS API Error:', errorText);
      throw new Error(`TTS request failed: ${response.status} ${response.statusText}`);
    }
    
    console.log('TTS response successful, returning audio buffer');
    // レスポンスボディを直接ArrayBufferとして返す
    const arrayBuffer = await response.arrayBuffer();
    console.log('Audio buffer size:', arrayBuffer.byteLength, 'bytes');
    return arrayBuffer;
  } catch (error) {
    console.error('Error in text to speech:', error);
    throw error;
  }
}
