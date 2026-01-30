import { NextRequest, NextResponse } from 'next/server'

// Din Retell Agent ID - byt ut mot din riktiga
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID || 'YOUR_AGENT_ID'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const from = formData.get('from') as string
    const to = formData.get('to') as string
    const callId = formData.get('callid') as string

    console.log('Incoming call:', { from, to, callId })

    // Koppla samtalet till Retell via SIP
    return NextResponse.json({
      "connect": `sip:${RETELL_AGENT_ID}@sip.retellai.com;transport=tcp`,
      "callerid": from
    })

  } catch (error) {
    console.error('Voice webhook error:', error)
    // Vid fel, lägg på
    return NextResponse.json({ "hangup": "error" })
  }
}
