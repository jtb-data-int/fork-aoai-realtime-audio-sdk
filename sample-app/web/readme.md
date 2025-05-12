# Azure OpenAI /realtime: an interactive chat using node-js


## Prereqs

1. Node.js installation (https://nodejs.org)
2. Environment that can run a localhost web server

## Using the sample

### 環境変数を使用する場合

1. このフォルダに移動
2. `.env.example` ファイルを `.env` にコピー
3. `.env` ファイルを編集し、Azure OpenAIまたはOpenAIの設定を入力
   - Azure OpenAI: `VITE_AZURE_OPENAI_ENDPOINT`, `VITE_AZURE_OPENAI_API_KEY`, `VITE_AZURE_OPENAI_DEPLOYMENT` を設定
   - OpenAI: `VITE_OPENAI_API_KEY`, `VITE_OPENAI_MODEL` を設定
4. `npm install` を実行して依存パッケージをダウンロード（`package.json` 参照）
5. `npm run dev` を実行してWebサーバーを起動し、ファイアウォールの許可プロンプトに対応
6. コンソール出力から提供されるURIを使用（例: `http://localhost:5173/`）してブラウザで開く
7. 環境変数から読み込まれた値が入力フィールドに表示されます
8. 「Record」ボタンをクリックしてセッションを開始し、マイク許可ダイアログに同意

### 環境変数を使用しない場合

1. このフォルダに移動
2. `npm install` を実行して依存パッケージをダウンロード（`package.json` 参照）
3. `npm run dev` を実行してWebサーバーを起動し、ファイアウォールの許可プロンプトに対応
4. コンソール出力から提供されるURIを使用（例: `http://localhost:5173/`）してブラウザで開く
5. 「Endpoint」フィールドに、Azure OpenAIリソースのエンドポイントを入力。`/realtime` を追加する必要はなく、例として `https://my-azure-openai-resource-from-portal.openai.azure.com` の形式です
6. 「API Key」フィールドに対応するAPIキーを入力
7. 「Record」ボタンをクリックしてセッションを開始し、マイク許可ダイアログに同意
8. You should see a `<< Session Started >>` message in the left-side output, after which you can speak to the app
9. You can interrupt the chat at any time by speaking and completely stop the chat by using the "Stop" button
10. Optionally, you can provide a System Message (e.g. try "You always talk like a friendly pirate") or a custom temperature; these will reflect upon the next session start

## Known issues

1. Connection errors are not yet gracefully handled and looping error spew may be observed in script debug output. Please just refresh the web page if an error appears.
2. Voice selection is not yet supported.
3. More authentication mechanisms, including keyless support via Entra, will come in a future service update.

## Code description

This sample uses a custom modification of OpenAI's JavaScript SDK (https://github.com/openai/openai-node) to provide a new `realtime` client. As noted in the parent readme, this is an unofficial modification that's subject to change and does not represent any final surface details in the SDK.

The primary file demonstrating `/realtime` use is [src/main.ts](./src/main.ts); the first few functions demonstrate connecting to `/realtime` using the client, sending an inference configuration message, and then processing the send/receive of messages on the connection.
