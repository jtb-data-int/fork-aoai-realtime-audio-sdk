import { useState, useEffect, useRef } from 'react'
import { LowLevelRTClient } from 'rt-client'
import { Player } from './utils/Player'
import { Recorder } from './utils/Recorder'
import './App.css'

// rt-clientの型定義
type Voice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'ash' | 'ballad' | 'coral' | 'sage' | 'verse';

type SessionUpdateMessage = {
  type: "session.update";
  session: {
    turn_detection?: {
      type: string;
    };
    input_audio_transcription?: {
      model: string;
    };
    instructions?: string;
    temperature?: number;
    voice?: Voice;
  };
}

enum InputState {
  Working,
  ReadyToStart,
  ReadyToStop,
}

// デフォルトのSystem Message
const DEFAULT_SYSTEM_MESSAGE = `あなたは経験豊富な旅行プランナーです。質問者の趣味や志向に応じて最適なプランを提示することができます。
なお、会話に当たっては以下を守るようにしてください。
・話し終わったら、質問者が応答するまで勝手に話さないでください。会話のキャッチボールを意識してください
・わからないことについては、はっきり「わかりません」と伝えるようにしてください`;

function App() {
  // 状態管理
  const [inputState, setInputState] = useState<InputState>(InputState.ReadyToStart)
  const [endpoint, setEndpoint] = useState<string>(import.meta.env.VITE_AZURE_OPENAI_ENDPOINT || '')
  const [apiKey, setApiKey] = useState<string>(import.meta.env.VITE_AZURE_OPENAI_API_KEY || import.meta.env.VITE_OPENAI_API_KEY || '')
  const [deploymentOrModel, setDeploymentOrModel] = useState<string>(import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT || import.meta.env.VITE_OPENAI_MODEL || '')
  const [isAzureOpenAI, setIsAzureOpenAI] = useState<boolean>(!!import.meta.env.VITE_AZURE_OPENAI_ENDPOINT)
  const [systemMessage, setSystemMessage] = useState<string>(DEFAULT_SYSTEM_MESSAGE)
  const [temperature, setTemperature] = useState<string>('')
  const [voice, setVoice] = useState<string>('')
  const [receivedText, setReceivedText] = useState<string[]>([])

  // Refs
  const realtimeStreamingRef = useRef<LowLevelRTClient | null>(null)
  const audioRecorderRef = useRef<Recorder | null>(null)
  const audioPlayerRef = useRef<Player | null>(null)
  const recordingActiveRef = useRef<boolean>(false)
  const bufferRef = useRef<Uint8Array>(new Uint8Array())
  const latestInputSpeechBlockRef = useRef<number>(-1)

  // 音声関連のユーティリティ関数
  const combineArray = (newData: Uint8Array) => {
    const newBuffer = new Uint8Array(bufferRef.current.length + newData.length);
    newBuffer.set(bufferRef.current);
    newBuffer.set(newData, bufferRef.current.length);
    bufferRef.current = newBuffer;
  }

  const processAudioRecordingBuffer = (data: Buffer) => {
    const uint8Array = new Uint8Array(data);
    combineArray(uint8Array);
    if (bufferRef.current.length >= 4800) {
      const toSend = new Uint8Array(bufferRef.current.slice(0, 4800));
      bufferRef.current = new Uint8Array(bufferRef.current.slice(4800));
      const regularArray = String.fromCharCode(...toSend);
      const base64 = btoa(regularArray);
      if (recordingActiveRef.current && realtimeStreamingRef.current) {
        realtimeStreamingRef.current.send({
          type: "input_audio_buffer.append",
          audio: base64,
        });
      }
    }
  }

  const resetAudio = async (startRecording: boolean) => {
    recordingActiveRef.current = false;
    if (audioRecorderRef.current) {
      audioRecorderRef.current.stop();
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.clear();
    }
    
    audioRecorderRef.current = new Recorder(processAudioRecordingBuffer);
    audioPlayerRef.current = new Player();
    await audioPlayerRef.current.init(24000);

    if (startRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioRecorderRef.current.start(stream);
        recordingActiveRef.current = true;
      } catch (error) {
        console.error("マイクへのアクセスに失敗しました", error);
        setInputState(InputState.ReadyToStart);
      }
    }
  }

  // リアルタイムストリーミング関連の機能
  const createConfigMessage = (): SessionUpdateMessage => {
    let configMessage: SessionUpdateMessage = {
      type: "session.update",
      session: {
        turn_detection: {
          type: "server_vad",
        },
        input_audio_transcription: {
          model: "whisper-1"
        }
      }
    };

    if (systemMessage) {
      configMessage.session.instructions = systemMessage;
    }
    if (temperature) {
      const tempValue = parseFloat(temperature);
      if (!isNaN(tempValue)) {
        configMessage.session.temperature = tempValue;
      }
    }
    if (voice) {
      configMessage.session.voice = voice as Voice;
    }

    return configMessage;
  }

  const handleRealtimeMessages = async () => {
    if (!realtimeStreamingRef.current) return;
    
    try {
      for await (const message of realtimeStreamingRef.current.messages()) {
        console.log(message.type);

        switch (message.type) {
          case "session.created":
            setInputState(InputState.ReadyToStop);
            setReceivedText(prev => [...prev, "<< Session Started >>", ""]);
            break;
          case "response.audio_transcript.delta":
            setReceivedText(prev => {
              const newTexts = [...prev];
              if (newTexts.length) {
                newTexts[newTexts.length - 1] += message.delta;
              } else {
                newTexts.push(message.delta);
              }
              return newTexts;
            });
            break;
          case "response.audio.delta":
            if (audioPlayerRef.current) {
              const binary = atob(message.delta);
              const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
              const pcmData = new Int16Array(bytes.buffer);
              audioPlayerRef.current.play(pcmData);
            }
            break;
          case "input_audio_buffer.speech_started":
            setReceivedText(prev => {
              const newTexts = [...prev, "<< Speech Started >>", ""];
              latestInputSpeechBlockRef.current = newTexts.length - 2;
              return newTexts;
            });
            if (audioPlayerRef.current) {
              audioPlayerRef.current.clear();
            }
            break;
          case "conversation.item.input_audio_transcription.completed":
            setReceivedText(prev => {
              const newTexts = [...prev];
              if (latestInputSpeechBlockRef.current >= 0) {
                newTexts[latestInputSpeechBlockRef.current] += ` User: ${message.transcript}`;
              }
              return newTexts;
            });
            break;
          case "response.done":
            setReceivedText(prev => [...prev, "---"]);
            break;
          default:
            console.log(JSON.stringify(message, null, 2));
            break;
        }
      }
    } catch (error) {
      console.error("メッセージ処理中にエラーが発生しました", error);
    }
    
    await resetAudio(false);
  }

  const startRealtime = async () => {
    setInputState(InputState.Working);

    const trimmedEndpoint = endpoint.trim();
    const trimmedApiKey = apiKey.trim();
    const trimmedDeploymentOrModel = deploymentOrModel.trim();

    if (isAzureOpenAI && (!trimmedEndpoint || !trimmedDeploymentOrModel)) {
      alert("Azure OpenAIを使用する場合は、EndpointとDeploymentが必要です");
      setInputState(InputState.ReadyToStart);
      return;
    }

    if (!isAzureOpenAI && !trimmedDeploymentOrModel) {
      alert("OpenAIを使用する場合は、Modelが必要です");
      setInputState(InputState.ReadyToStart);
      return;
    }

    if (!trimmedApiKey) {
      alert("API Keyは必須です");
      setInputState(InputState.ReadyToStart);
      return;
    }

    try {
      if (isAzureOpenAI) {
        realtimeStreamingRef.current = new LowLevelRTClient(
          new URL(trimmedEndpoint), 
          { key: trimmedApiKey }, 
          { deployment: trimmedDeploymentOrModel }
        );
      } else {
        realtimeStreamingRef.current = new LowLevelRTClient(
          { key: trimmedApiKey }, 
          { model: trimmedDeploymentOrModel }
        );
      }

      console.log("sending session config");
      await realtimeStreamingRef.current.send(createConfigMessage());
      console.log("sent");
      
      await Promise.all([resetAudio(true), handleRealtimeMessages()]);
    } catch (error) {
      console.error("接続エラー", error);
      setReceivedText(prev => [...prev, "[Connection error]: 初期設定メッセージを送信できませんでした。エンドポイントと認証情報を確認してください。"]);
      setInputState(InputState.ReadyToStart);
    }
  }

  const stopRealtime = async () => {
    setInputState(InputState.Working);
    await resetAudio(false);
    if (realtimeStreamingRef.current) {
      realtimeStreamingRef.current.close();
    }
    setInputState(InputState.ReadyToStart);
  }

  const clearAll = () => {
    setReceivedText([]);
  }

  // エンドポイントURLに基づいてAzure OpenAIか判定
  useEffect(() => {
    setIsAzureOpenAI(endpoint.indexOf('azure') > -1);
  }, [endpoint]);

  return (
    <div className="app-container">
      <div className="container">
        <div id="received-text-container">
          {receivedText.map((text, index) => (
            text === "---" ? <hr key={index} /> : <p key={index}>{text}</p>
          ))}
        </div>
        <div className="controls">
          <div className="input-group">
            <label htmlFor="endpoint">Endpoint (from .env if available)</label>
            <input 
              id="endpoint" 
              type="text" 
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="Enter resource/endpoint URL"
              disabled={inputState !== InputState.ReadyToStart}
            />
            <div className="toggle-group">
              <label htmlFor="azure-toggle">Azure OpenAI</label>
              <input 
                id="azure-toggle" 
                type="checkbox" 
                checked={isAzureOpenAI}
                onChange={(e) => setIsAzureOpenAI(e.target.checked)}
                disabled={inputState !== InputState.ReadyToStart}
              />
            </div>
            <label htmlFor="api-key">API Key (from .env if available)</label>
            <input 
              id="api-key" 
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key"
              disabled={inputState !== InputState.ReadyToStart}
            />
            <label htmlFor="deployment-or-model">Deployment/Model (from .env if available)</label>
            <input 
              id="deployment-or-model" 
              type="text"
              value={deploymentOrModel}
              onChange={(e) => setDeploymentOrModel(e.target.value)}
              placeholder="Enter deployment/model, e.g. gpt-4o-realtime-preview-2024-10-01"
              disabled={inputState !== InputState.ReadyToStart}
            />
          </div>
          <div className="input-group">
            <div className="button-group">
              <button 
                onClick={startRealtime}
                disabled={inputState !== InputState.ReadyToStart}
              >
                Record
              </button>
              <button 
                onClick={stopRealtime}
                disabled={inputState !== InputState.ReadyToStop}
              >
                Stop
              </button>
            </div>
            <div className="input-group">
              <label htmlFor="session-instructions">System Message</label>
              <textarea 
                id="session-instructions"
                value={systemMessage}
                onChange={(e) => setSystemMessage(e.target.value)}
                placeholder="デフォルトでは旅行プランナーの設定になっています。必要に応じて編集してください。"
                rows={4}
                disabled={inputState !== InputState.ReadyToStart}
              />
            </div>
            <div className="input-group">
              <label htmlFor="temperature">Temperature</label>
              <input 
                id="temperature" 
                type="number"
                min="0.6"
                max="1.2"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                placeholder="0.6-1.2 (default 0.8)"
                disabled={inputState !== InputState.ReadyToStart}
              />
            </div>
            <div className="input-group">
              <label htmlFor="voice">Voice</label>
              <select 
                id="voice"
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                disabled={inputState !== InputState.ReadyToStart}
              >
                <option value=""></option>
                <option value="alloy">alloy</option>
                <option value="ash">ash</option>
                <option value="ballad">ballad</option>
                <option value="coral">coral</option>
                <option value="echo">echo</option>
                <option value="sage">sage</option>
                <option value="shimmer">shimmer</option>
                <option value="verse">verse</option>
              </select>
            </div>
            <div className="button-group">
              <button 
                onClick={clearAll}
                type="button"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
