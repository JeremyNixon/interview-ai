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

import { useEffect, useRef, useCallback, useState } from 'react';

import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType, FormattedItemType, FunctionCallItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { instructions, sendToGPT4 } from '../utils/conversation_config.js';
import { WavRenderer } from '../utils/wav_renderer';

import { X, Edit, Zap, ArrowUp, ArrowDown, Mic } from 'react-feather';
import { Button } from '../components/button/Button';
import { Toggle } from '../components/toggle/Toggle';

import './ConsolePage.scss';
import { isJsxOpeningLikeElement } from 'typescript';
import { Buffer } from 'buffer';
import axios from 'axios'; // Make sure to install axios: npm install axios
import debounce from 'lodash/debounce';
import jsPDF from 'jspdf';

/**
 * Type for result from get_weather() function call
 */
interface Coordinates {
  lat: number;
  lng: number;
  location?: string;
  temperature?: {
    value: number;
    units: string;
  };
  wind_speed?: {
    value: number;
    units: string;
  };
}

/**
 * Type for all event logs
 */
interface RealtimeEvent {
  time: string;
  source: 'client' | 'server';
  count?: number;
  event: { [key: string]: any };
}

// Add this type definition at the top of the file
type FunctionCallItem = {
  name: string;
  arguments: Record<string, any>;
};

export function ConsolePage() {
  /**
   * Ask user for API Key
   * If we're using the local relay server, we don't need this
   */
  const apiKey = LOCAL_RELAY_SERVER_URL
    ? ''
    : localStorage.getItem('tmp::voice_api_key') ||
      prompt('OpenAI API Key') ||
      '';
  if (apiKey !== '') {
    localStorage.setItem('tmp::voice_api_key', apiKey);
  }

  /**
   * Instantiate:
   * - WavRecorder (speech input)
   * - WavStreamPlayer (speech output)
   * - RealtimeClient (API client)
   */
  const wavRecorderRef = useRef<WavRecorder>(
    new WavRecorder({ sampleRate: 24000 })
  );
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(
    new WavStreamPlayer({ sampleRate: 24000 })
  );
  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient(
      LOCAL_RELAY_SERVER_URL
        ? { url: LOCAL_RELAY_SERVER_URL }
        : {
            apiKey: apiKey,
            dangerouslyAllowAPIKeyInBrowser: true,
          }
    )
  );

  /**
   * References for
   * - Rendering audio visualization (canvas)
   * - Autoscrolling event logs
   * - Timing delta for event log displays
   */
  const clientCanvasRef = useRef<HTMLCanvasElement>(null);
  const serverCanvasRef = useRef<HTMLCanvasElement>(null);
  const eventsScrollHeightRef = useRef(0);
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<string>(new Date().toISOString());

  /**
   * All of our variables for displaying application state
   * - items are all conversation items (dialog)
   * - realtimeEvents are event logs, which can be expanded
   * - memoryKv is for set_memory() function
   * - coords, marker are for get_weather() function
   */
  const [items, setItems] = useState<ItemType[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<{
    [key: string]: boolean;
  }>({});
  const [isConnected, setIsConnected] = useState(false);
  const [canPushToTalk, setCanPushToTalk] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [memoryKv, setMemoryKv] = useState<{ [key: string]: any }>({});
  const [coords, setCoords] = useState<Coordinates | null>({
    lat: 37.775593,
    lng: -122.418137,
  });
  const [marker, setMarker] = useState<Coordinates | null>(null);
  const [isStarted, setIsStarted] = useState(false);

  // Add a new state to store the generated book content
  const [generatedBookContent, setGeneratedBookContent] = useState<string | null>(null);

  /**
   * Utility for formatting the timing of logs
   */
  const formatTime = useCallback((timestamp: string) => {
    const startTime = startTimeRef.current;
    const t0 = new Date(startTime).valueOf();
    const t1 = new Date(timestamp).valueOf();
    const delta = t1 - t0;
    const hs = Math.floor(delta / 10) % 100;
    const s = Math.floor(delta / 1000) % 60;
    const m = Math.floor(delta / 60_000) % 60;
    const pad = (n: number) => {
      let s = n + '';
      while (s.length < 2) {
        s = '0' + s;
      }
      return s;
    };
    return `${pad(m)}:${pad(s)}.${pad(hs)}`;
  }, []);

  /**
   * When you click the API key
   */
  const resetAPIKey = useCallback(() => {
    const apiKey = prompt('OpenAI API Key');
    if (apiKey !== null) {
      localStorage.clear();
      localStorage.setItem('tmp::voice_api_key', apiKey);
      window.location.reload();
    }
  }, []);

  /**
   * Connect to conversation:
   * WavRecorder taks speech input, WavStreamPlayer output, client is API client
   */
  const connectConversation = useCallback(async () => {
    console.log("connectConversation function called");
    console.log("Starting connection process...");
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    // Set state variables
    startTimeRef.current = new Date().toISOString();
    setIsConnected(true);
    setRealtimeEvents([]);
    setItems(client.conversation.getItems());

    console.log("Connecting to microphone...");
    // Connect to microphone
    await wavRecorder.begin();
    console.log("Microphone connected successfully.");

    console.log("Connecting to audio output...");
    // Connect to audio output
    await wavStreamPlayer.connect();
    console.log("Audio output connected successfully.");

    console.log("Connecting to realtime API...");
    // Connect to realtime API
    await client.connect();
    console.log("Realtime API connected successfully.");

    // Set up push-to-talk mode by default
    console.log("Setting up push-to-talk mode...");
    await client.updateSession({ turn_detection: null });

    client.sendUserMessageContent([
      {
        type: `input_text`,
        text: `Hello!`,
      },
    ]);

    console.log("Push-to-talk mode set up successfully.");
    setIsStarted(true);
  }, []);

  /**
   * Disconnect and reset conversation state
   */
  const disconnectConversation = useCallback(async () => {
    console.log("disconnectConversation function called");
    setIsConnected(false);
    setRealtimeEvents([]);
    setItems([]);
    setMemoryKv({});
    setCoords({
      lat: 37.775593,
      lng: -122.418137,
    });
    setMarker(null);

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();

    setIsStarted(false);
  }, []);

  const deleteConversationItem = useCallback(async (id: string) => {
    console.log(`deleteConversationItem function called with id: ${id}`);
    const client = clientRef.current;
    client.deleteItem(id);
  }, []);

  /**
   * In push-to-talk mode, start recording
   * .appendInputAudio() for each sample
   */
  const startRecording = async () => {
    console.log("startRecording function called");
    if (isRecording) return; // Don't start if already recording
    setIsRecording(true);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const trackSampleOffset = await wavStreamPlayer.interrupt();
    if (trackSampleOffset?.trackId) {
      const { trackId, offset } = trackSampleOffset;
      await client.cancelResponse(trackId, offset);
    }
    await wavRecorder.record((data) => {
      client.appendInputAudio(data.mono);
      console.log("Audio data appended");
    });
  };

  /**
   * In push-to-talk mode, stop recording
   */
  const stopRecording = async () => {
    console.log("stopRecording function called");
    if (!isRecording) return; // Don't stop if not recording
    setIsRecording(false);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.pause();
    client.createResponse();
    console.log("Response created");
  };

  /**
   * Switch between Manual <> VAD mode for communication
   */
  const changeTurnEndType = async (value: string) => {
    console.log(`changeTurnEndType function called with value: ${value}`);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    if (value === 'none' && wavRecorder.getStatus() === 'recording') {
      await wavRecorder.pause();
    }
    client.updateSession({
      turn_detection: value === 'none' ? null : { type: 'server_vad' },
    });
    if (value === 'server_vad' && client.isConnected()) {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
    setCanPushToTalk(value === 'none');
  };

  /**
   * Auto-scroll the event logs
   */
  useEffect(() => {
    if (eventsScrollRef.current) {
      const eventsEl = eventsScrollRef.current;
      const scrollHeight = eventsEl.scrollHeight;
      // Only scroll if height has just changed
      if (scrollHeight !== eventsScrollHeightRef.current) {
        eventsEl.scrollTop = scrollHeight;
        eventsScrollHeightRef.current = scrollHeight;
      }
    }
  }, [realtimeEvents]);

  /**
   * Auto-scroll the conversation logs
   */
  useEffect(() => {
    const conversationEls = [].slice.call(
      document.body.querySelectorAll('[data-conversation-content]')
    );
    for (const el of conversationEls) {
      const conversationEl = el as HTMLDivElement;
      conversationEl.scrollTop = conversationEl.scrollHeight;
    }
  }, [items]);

  /**
   * Set up render loops for the visualization canvas
   */
  useEffect(() => {
    let isLoaded = true;

    const wavRecorder = wavRecorderRef.current;
    const clientCanvas = clientCanvasRef.current;
    let clientCtx: CanvasRenderingContext2D | null = null;

    const wavStreamPlayer = wavStreamPlayerRef.current;
    const serverCanvas = serverCanvasRef.current;
    let serverCtx: CanvasRenderingContext2D | null = null;

    const render = () => {
      if (isLoaded) {
        if (clientCanvas) {
          if (!clientCanvas.width || !clientCanvas.height) {
            clientCanvas.width = clientCanvas.offsetWidth;
            clientCanvas.height = clientCanvas.offsetHeight;
          }
          clientCtx = clientCtx || clientCanvas.getContext('2d');
          if (clientCtx) {
            clientCtx.clearRect(0, 0, clientCanvas.width, clientCanvas.height);
            const result = wavRecorder.recording
              ? wavRecorder.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              clientCanvas,
              clientCtx,
              result.values,
              '#0099ff',
              10,
              0,
              8
            );
          }
        }
        if (serverCanvas) {
          if (!serverCanvas.width || !serverCanvas.height) {
            serverCanvas.width = serverCanvas.offsetWidth;
            serverCanvas.height = serverCanvas.offsetHeight;
          }
          serverCtx = serverCtx || serverCanvas.getContext('2d');
          if (serverCtx) {
            serverCtx.clearRect(0, 0, serverCanvas.width, serverCanvas.height);
            const result = wavStreamPlayer.analyser
              ? wavStreamPlayer.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              serverCanvas,
              serverCtx,
              result.values,
              '#009900',
              10,
              0,
              8
            );
          }
        }
        window.requestAnimationFrame(render);
      }
    };
    render();

    return () => {
      isLoaded = false;
    };
  }, []);

  /**
   * Core RealtimeClient and audio capture setup
   * Set all of our instructions, tools, events and more
   */
  useEffect(() => {
    // Get refs
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const client = clientRef.current;

    // Set instructions
    client.updateSession({ instructions: instructions });
    // Set transcription, otherwise we don't get user transcriptions back
    client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });

    // Add tools
    client.addTool(
      {
        name: 'set_memory',
        description: 'Saves important data about the user into memory.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description:
                'The key of the memory value. Always use lowercase and underscores, no other characters.',
            },
            value: {
              type: 'string',
              description: 'Value can be anything represented as a string',
            },
          },
          required: ['key', 'value'],
        },
      },
      async ({ key, value }: { [key: string]: any }) => {
        setMemoryKv((memoryKv) => {
          const newKv = { ...memoryKv };
          newKv[key] = value;
          return newKv;
        });
        return { ok: true };
      }
    );
    client.addTool(
      {
        name: 'get_weather',
        description:
          'Retrieves the weather for a given lat, lng coordinate pair. Specify a label for the location.',
        parameters: {
          type: 'object',
          properties: {
            lat: {
              type: 'number',
              description: 'Latitude',
            },
            lng: {
              type: 'number',
              description: 'Longitude',
            },
            location: {
              type: 'string',
              description: 'Name of the location',
            },
          },
          required: ['lat', 'lng', 'location'],
        },
      },
      async ({ lat, lng, location }: { [key: string]: any }) => {
        setMarker({ lat, lng, location });
        setCoords({ lat, lng, location });
        const result = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m`
        );
        const json = await result.json();
        const temperature = {
          value: json.current.temperature_2m as number,
          units: json.current_units.temperature_2m as string,
        };
        const wind_speed = {
          value: json.current.wind_speed_10m as number,
          units: json.current_units.wind_speed_10m as string,
        };
        setMarker({ lat, lng, location, temperature, wind_speed });
        return json;
      }
    );

    // handle realtime events from client + server for event logging
    client.on('realtime.event', (realtimeEvent: RealtimeEvent) => {
      setRealtimeEvents((realtimeEvents) => {
        const lastEvent = realtimeEvents[realtimeEvents.length - 1];
        if (lastEvent?.event.type === realtimeEvent.event.type) {
          // if we receive multiple events in a row, aggregate them for display purposes
          lastEvent.count = (lastEvent.count || 0) + 1;
          return realtimeEvents.slice(0, -1).concat(lastEvent);
        } else {
          return realtimeEvents.concat(realtimeEvent);
        }
      });
    });
    client.on('error', (event: any) => console.error(event));
    client.on('conversation.interrupted', async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
    });
    client.on('conversation.updated', async ({ item, delta }: any) => {
      const items = client.conversation.getItems();
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(
          item.formatted.audio,
          24000,
          24000
        );
        item.formatted.file = wavFile;
      }
      
      setItems(items);
    });

    setItems(client.conversation.getItems());

    return () => {
      // cleanup; resets to defaults
      client.reset();
    };
  }, []);

  const togglePushToTalk = useCallback(async () => {
    console.log("togglePushToTalk function called");
    if (!isStarted) {
      console.log("Starting conversation...");
      await connectConversation();
    }

    setCanPushToTalk((prev) => !prev);
    if (canPushToTalk) {
      await startRecording();
    } else {
      await stopRecording();
    }
  }, [isStarted, canPushToTalk, connectConversation, startRecording, stopRecording]);

  // Modify this function to generate book content after each user interaction
  const generateBookContent = useCallback(async () => {
    console.log("generateBookContent function called");
    if (!clientRef.current || !isConnected) return;

    const conversationContext = items.map(item => {
      if ('formatted' in item) {
        return `${item.role}: ${(item as FormattedItemType).formatted.text}`;
      } else if ('name' in item && 'arguments' in item) {
        const functionItem = item as FunctionCallItem;
        return `Function Call - ${functionItem.name}: ${JSON.stringify(functionItem.arguments)}`;
      }
      return '';
    }).join('\n');

    console.log("Sending context to GPT-4 for book generation:", conversationContext);

    try {
      const fullResponse = await sendToGPT4(conversationContext, true);
      console.log("Full book content from GPT-4:", fullResponse);

      // Save the generated content to state and local storage
      setGeneratedBookContent(fullResponse);
      localStorage.setItem('generatedBookContent', fullResponse);

    } catch (error) {
      console.error('Error generating book content with GPT-4:', error);
    }
  }, [items, isConnected]);

  // Modify this useEffect to call generateBookContent after each user interaction
  useEffect(() => {
    if (items.length > 0 && items[items.length - 1].role === 'user') {
      console.log("User message detected, generating book content");
      generateBookContent();
    }
  }, [items, generateBookContent]);

  // Remove the separate button for generating book content
  // The export function remains the same
  const exportConversationAsPDF = useCallback(() => {
    console.log("exportConversationAsPDF function called");
    
    if (generatedBookContent) {
      createPDF(generatedBookContent);
    } else {
      console.log("No book content generated yet");
    }
  }, [generatedBookContent]);

  const createPDF = (content: string) => {
    const pdf = new jsPDF();
    let pageNumber = 1;

    const addPageNumber = () => {
      pdf.setFontSize(10);
      pdf.text(String(pageNumber), pdf.internal.pageSize.width / 2, pdf.internal.pageSize.height - 10, { align: 'center' });
      pageNumber++;
    };

    // Title Page
    pdf.setFontSize(24);
    pdf.text('My Conversation Book', pdf.internal.pageSize.width / 2, 100, { align: 'center' });
    pdf.setFontSize(16);
    pdf.text('by AI and Human', pdf.internal.pageSize.width / 2, 120, { align: 'center' });
    addPageNumber();

    // Copyright Page
    pdf.addPage();
    pdf.setFontSize(12);
    pdf.text(`Copyright © ${new Date().getFullYear()} by AI and Human`, 20, 30);
    pdf.text('All rights reserved.', 20, 40);
    addPageNumber();

    // Table of Contents
    pdf.addPage();
    pdf.setFontSize(18);
    pdf.text('Table of Contents', pdf.internal.pageSize.width / 2, 20, { align: 'center' });
    addPageNumber();

    // Content
    const contentLines = content.split('\n');
    let yOffset = 20;

    contentLines.forEach((line) => {
      if (line.startsWith('Chapter')) {
        if (yOffset > 20) {
          pdf.addPage();
          yOffset = 20;
        }
        pdf.setFontSize(18);
        pdf.text(line, pdf.internal.pageSize.width / 2, yOffset, { align: 'center' });
        yOffset += 20;
      } else {
        pdf.setFontSize(12);
        const splitContent = pdf.splitTextToSize(line, 170);
        
        if (yOffset + splitContent.length * 7 > pdf.internal.pageSize.height - 20) {
          pdf.addPage();
          yOffset = 20;
        }

        pdf.text(splitContent, 20, yOffset);
        yOffset += splitContent.length * 7 + 10;
      }
      addPageNumber();
    });

    // Save the PDF
    pdf.save('conversation_book.pdf');
  };

  /**
   * Render the application
   */
  return (
    <div data-component="ConsolePage">
      <div className="content-top">
        <div className="content-title">
          <img src="/logo.png" alt="Roasted.lol logo" />
          <span className="web-name">roasted.lol</span>
        </div>
      </div>
      <div className={`content-main centered`}>
        <div className="push-to-talk-container">
          <Button
            label={isStarted ? (canPushToTalk ? "Push to Talk" : "Listening...") : "Start Conversation"}
            buttonStyle={isStarted ? (canPushToTalk ? "action" : "alert") : "action"}
            onClick={togglePushToTalk}
          />
        </div>
        {isStarted && (
          <div className="export-container">
            <Button
              label="Export as PDF"
              buttonStyle="action"
              onClick={exportConversationAsPDF}
            />
          </div>
        )}
      </div>
      {/* ... existing modals and other components ... */}
    </div>
  );
}