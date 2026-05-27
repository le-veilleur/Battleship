export class WebRTCPeer {
  private pc: RTCPeerConnection
  channel: RTCDataChannel | null = null
  onChannelOpen: (() => void) | null = null
  onChannelClose: (() => void) | null = null
  onChannelMessage: ((data: string) => void) | null = null

  constructor() {
    this.pc = new RTCPeerConnection({ iceServers: [] })
  }

  async createOffer(): Promise<string> {
    this.channel = this.pc.createDataChannel('game', { ordered: true })
    this.wireChannel(this.channel)
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    return this.awaitICEComplete()
  }

  async createAnswer(offerBlob: string): Promise<string> {
    this.pc.ondatachannel = (e) => {
      this.channel = e.channel
      this.wireChannel(e.channel)
    }
    await this.pc.setRemoteDescription(JSON.parse(offerBlob) as RTCSessionDescriptionInit)
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)
    return this.awaitICEComplete()
  }

  async acceptAnswer(answerBlob: string): Promise<void> {
    await this.pc.setRemoteDescription(JSON.parse(answerBlob) as RTCSessionDescriptionInit)
  }

  send(data: unknown): void {
    if (this.channel?.readyState === 'open') {
      this.channel.send(JSON.stringify(data))
    }
  }

  close(): void {
    this.channel?.close()
    this.pc.close()
  }

  private wireChannel(ch: RTCDataChannel): void {
    ch.onopen = () => this.onChannelOpen?.()
    ch.onclose = () => this.onChannelClose?.()
    ch.onmessage = (e: MessageEvent) => this.onChannelMessage?.(e.data as string)
  }

  private awaitICEComplete(): Promise<string> {
    return new Promise(resolve => {
      if (this.pc.iceGatheringState === 'complete') {
        resolve(JSON.stringify(this.pc.localDescription))
        return
      }
      this.pc.onicegatheringstatechange = () => {
        if (this.pc.iceGatheringState === 'complete') {
          resolve(JSON.stringify(this.pc.localDescription))
        }
      }
    })
  }
}
