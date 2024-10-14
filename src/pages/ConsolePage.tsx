/**
 * Running a local relay server will allow you to hide your API key
 * and run custom logic on the server
 *
 * Set the local relay server address to:
 * REACT_APP_LOCAL_RELAY_SERVER_URL=http://localhost:8081
 *
 * This will also require you to set OPENAI_API_KEY= in a `.env` file
 * You can run it with `npm run relay`, in parallel with `npm start`
 */
const LOCAL_RELAY_SERVER_URL: string =
  process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RealtimeClient } from '@openai/realtime-api-beta';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { instructions } from '../utils/conversation_config.js';
import { Button } from '../components/button/Button';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import './ConsolePage.scss';

export function ConsolePage() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [conversationText, setConversationText] = useState<string>('');
  const [bookContent, setBookContent] = useState<string>('');

  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient(
      LOCAL_RELAY_SERVER_URL
        ? { url: LOCAL_RELAY_SERVER_URL }
        : {
            apiKey: process.env.REACT_APP_OPENAI_API_KEY,
            dangerouslyAllowAPIKeyInBrowser: true,
          },
    ),
  );
  const wavRecorderRef = useRef<WavRecorder>(
    new WavRecorder({ sampleRate: 24000 }),
  );
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(
    new WavStreamPlayer({ sampleRate: 24000 }),
  );

  useEffect(() => {
    // Load saved data from localStorage
    const savedConversation = localStorage.getItem('conversationText');
    const savedBook = localStorage.getItem('bookContent');
    if (savedConversation) setConversationText(savedConversation);
    if (savedBook) setBookContent(savedBook);

    // Set up event listener for beforeunload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue =
        'You may lose unsaved progress if you leave. Are you sure?';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    // Save data to localStorage whenever it changes
    localStorage.setItem('conversationText', conversationText);
    localStorage.setItem('bookContent', bookContent);
  }, [conversationText, bookContent]);

  const connectConversation = useCallback(async () => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    try {
      setIsConnected(true);
      await wavRecorder.begin();
      await wavStreamPlayer.connect();
      await client.connect();
      await client.updateSession({ turn_detection: null });
      client.sendUserMessageContent([
        {
          type: 'input_text',
          text: "Hello! I'm ready to start our interview.",
        },
      ]);
    } catch (error) {
      console.error('Error connecting:', error);
      setIsConnected(false);
    }
  }, []);

  const handleHoldToTalk = async (isHolding: boolean) => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;

    if (isHolding) {
      setIsRecording(true);
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    } else {
      setIsRecording(false);
      await wavRecorder.pause();
      client.createResponse();
    }
  };

  const downloadPDF = () => {
    // Set up the fonts
    pdfMake.vfs = pdfFonts.pdfMake.vfs;

    const docDefinition: TDocumentDefinitions = {
      content: [{ text: 'Your Book', style: 'header' }, bookContent],
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          margin: [0, 0, 0, 10] as [number, number, number, number],
        },
      },
    };

    // Create and download the PDF
    pdfMake.createPdf(docDefinition).download('your_book.pdf');
  };

  useEffect(() => {
    const client = clientRef.current;
    client.updateSession({ instructions: instructions });
    client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });

    client.on('conversation.updated', async ({ item, delta }: any) => {
      if (delta?.text) {
        setConversationText((prev) => prev + delta.text);

        // Update book content
        const bookUpdatePrompt = `Based on the following conversation, continue writing the book:
        
        ${conversationText}
        ${delta.text}
        
        Current book content:
        ${bookContent}
        
        Continue the book:`;

        const bookResponse = await fetch(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'gpt-4',
              messages: [{ role: 'user', content: bookUpdatePrompt }],
              stream: true,
            }),
          },
        );

        const reader = bookResponse.body?.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = (await reader?.read()) || {
            done: true,
            value: undefined,
          };
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          const parsedLines = lines
            .map((line) => line.replace(/^data: /, '').trim())
            .filter((line) => line !== '' && line !== '[DONE]')
            .map((line) => JSON.parse(line));

          for (const parsedLine of parsedLines) {
            const { choices } = parsedLine;
            const { delta } = choices[0];
            const { content } = delta;
            if (content) {
              setBookContent((prev) => prev + content);
            }
          }
        }
      }
      if (delta?.audio) {
        await wavStreamPlayerRef.current.add16BitPCM(delta.audio, item.id);
      }
    });

    return () => {
      client.reset();
    };
  }, []);

  return (
    <div className="console-page">
      <div className="content">
        <div className="conversation-area">
          <h3>Conversation</h3>
          <pre>{conversationText}</pre>
        </div>
        <div className="book-preview">
          <h3>Book Preview</h3>
          <pre>{bookContent}</pre>
        </div>
      </div>
      <div className="controls">
        <Button
          label="Hold to Talk"
          buttonStyle={isRecording ? 'alert' : 'action'}
          onMouseDown={() => handleHoldToTalk(true)}
          onMouseUp={() => handleHoldToTalk(false)}
          onMouseLeave={() => handleHoldToTalk(false)}
        />
        <Button
          label="Download PDF"
          buttonStyle="action"
          onClick={downloadPDF}
        />
      </div>
    </div>
  );
}
