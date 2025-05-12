/**
 * Manages audio buffers for recording
 */
export class AudioBufferManager {
  private buffer: Uint8Array = new Uint8Array();
  private audioChunks: Array<Uint8Array> = [];
  private isRecording: boolean = false;
  
  /**
   * Adds audio data to the buffer
   */
  public appendData(data: Uint8Array): void {
    if (!this.isRecording) return;
    
    // Add to internal buffer
    const newBuffer = new Uint8Array(this.buffer.length + data.length);
    newBuffer.set(this.buffer);
    newBuffer.set(data, this.buffer.length);
    this.buffer = newBuffer;
    
    // Also keep in chunks for final processing
    this.audioChunks.push(data.slice());
  }
  
  /**
   * Gets the current buffer content
   */
  public getBuffer(): Uint8Array {
    return this.buffer;
  }
  
  /**
   * Resets the buffer
   */
  public resetBuffer(): void {
    this.buffer = new Uint8Array();
  }
  
  /**
   * Starts recording
   */
  public startRecording(): void {
    this.isRecording = true;
    this.audioChunks = [];
    this.resetBuffer();
  }
  
  /**
   * Stops recording and returns the complete audio data
   */
  public stopRecording(): ArrayBuffer {
    this.isRecording = false;
    
    // Convert int16 PCM to wav format
    const dataLength = this.audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new ArrayBuffer(44 + dataLength);
    const view = new DataView(result);
    
    // Write WAV header
    // "RIFF" chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    
    // "fmt " sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk length
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // mono channel
    view.setUint32(24, 24000, true); // sample rate
    view.setUint32(28, 24000 * 2, true); // byte rate (sample rate * block align)
    view.setUint16(32, 2, true); // block align (channels * bytes per sample)
    view.setUint16(34, 16, true); // bits per sample
    
    // "data" sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);
    
    // Write audio data
    let offset = 44;
    for (const chunk of this.audioChunks) {
      for (let i = 0; i < chunk.length; i++) {
        view.setUint8(offset, chunk[i]);
        offset++;
      }
    }
    
    return result;
  }
  
  /**
   * Checks if currently recording
   */
  public isCurrentlyRecording(): boolean {
    return this.isRecording;
  }
}

// Helper function to write string to DataView
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
