import { useState, useEffect, useRef } from 'react'
import { LowLevelRTClient } from 'rt-client'
import { Player } from './utils/Player'
import { Recorder } from './utils/Recorder'
import { processQueryForStaticData } from './utils/StaticDataProvider'
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
            const userTranscript = message.transcript;
            
            setReceivedText(prev => {
              const newTexts = [...prev];
              if (latestInputSpeechBlockRef.current >= 0) {
                newTexts[latestInputSpeechBlockRef.current] += ` User: ${userTranscript}`;
              }
              return newTexts;
            });
            
            // Check if this query should receive static data response
            const staticData = processQueryForStaticData(userTranscript);
            if (staticData && realtimeStreamingRef.current) {
              // Update the system message with the static data
              const updatedSystemMessage = `${systemMessage}\n\n【アシスタントへの追加情報】\n${staticData}`;
              
              // Send the updated system message to the AI
              await realtimeStreamingRef.current.send({
                type: "session.update",
                session: {
                  instructions: updatedSystemMessage
                }
              });
              
              // Log that static data was injected (for debugging)
              console.log("Static flight data injected into conversation");
            }
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

  // Resize panel functionality
  const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    
    const container = document.querySelector('.container') as HTMLElement;
    const resizablePanel = document.querySelector('.resizable-panel') as HTMLElement;
    const initialX = e.clientX;
    const initialWidth = resizablePanel.offsetWidth;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - initialX;
      const newWidth = initialWidth + deltaX;
      
      // Set min and max width constraints
      const minWidth = 250;
      const maxWidth = Math.min(600, container.offsetWidth * 0.7); // 70% of container width or 600px, whichever is smaller
      
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        resizablePanel.style.width = `${newWidth}px`;
      }
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="app-container">
      <div className="container">
        <div className="resizable-panel" style={{ width: '320px' }}>
          <div className="resize-handle" onMouseDown={handleResizeStart}></div>
          <div className="controls">
            <h2 className="section-heading">Connection Settings</h2>
          <div className="input-group connection-settings">
            <label htmlFor="endpoint">Endpoint</label>
            <input 
              id="endpoint" 
              type="text" 
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="Enter resource/endpoint URL"
              disabled={true}
            />
          </div>
          
          <div className="toggle-group connection-settings">
            <label htmlFor="azure-toggle">Azure OpenAI</label>
            <input 
              id="azure-toggle" 
              type="checkbox" 
              checked={isAzureOpenAI}
              onChange={(e) => setIsAzureOpenAI(e.target.checked)}
              disabled={true}
            />
          </div>
          
          <div className="input-group connection-settings">
            <label htmlFor="api-key">API Key</label>
            <input 
              id="api-key" 
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key"
              disabled={true}
            />
          </div>
          
          <div className="input-group connection-settings">
            <label htmlFor="deployment-or-model">Deployment/Model</label>
            <input 
              id="deployment-or-model" 
              type="text"
              value={deploymentOrModel}
              onChange={(e) => setDeploymentOrModel(e.target.value)}
              placeholder="gpt-4o-realtime-preview"
              disabled={true}
            />
          </div>
          
          <h2 className="section-heading">Model Configuration</h2>
          <div className="input-group">
            <label htmlFor="session-instructions">System Message(AIへの指示)</label>
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
              type="text"
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
              <option value="">Select voice...</option>
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
              onClick={startRealtime}
              disabled={inputState !== InputState.ReadyToStart}
            >
              会話を開始
            </button>
            <button 
              className="stop-button"
              onClick={stopRealtime}
              disabled={inputState !== InputState.ReadyToStop}
            >
              会話を停止
            </button>
          </div>
          
          <div className="button-group">
            <button 
              className="clear-button"
              onClick={clearAll}
              type="button"
            >
              会話履歴をクリア
            </button>
          </div>
        </div>
        </div>
        
        <div id="received-text-container">
          {receivedText.map((text, index) => (
            text === "---" ? <hr key={index} /> : <p key={index}>{text}</p>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
