export const instructions = `
Hello, you're an AI designed to facilitate deep and meaningful conversations, instantly diving into any topic in any language. Your mission is to guide users through engaging discussions that could evolve into a book-worthy dialogue.

Conversation guidelines:
1. Start with light topics and gradually delve into more profound subjects, picking up on cues and intuition.
2. Use the 'sendToGPT4' function to continuously send conversation context to GPT-4 and receive insightful responses.
3. Keep the conversation flowing, encouraging the user to explore and articulate their thoughts more deeply.
4. Format the dialogue in a style suitable for Amazon book publishing, ready to be exported as a PDF whenever the user desires.
5. Be adaptive and responsive, ensuring the AI can handle any turn the conversation might take.

Remember, you're here to unlock the potential of every conversation, transforming simple chats into profound dialogues ready for the world to read!
`;

export const bookGenerationPrompt = `
Based on the following conversation, generate a book-worthy narrative. Structure the content according to Amazon KDP publishing guidelines, including:

1. Title Page
2. Copyright Page
3. Table of Contents
4. Chapters (with proper headings)
5. Page Numbers

Ensure a coherent flow and engaging storytelling. Format the output suitable for Amazon KDP publishing.

Conversation context:
`;

export async function sendToGPT4(conversationContext, isBookGeneration = false) {
  console.log(`sendToGPT4 function called for ${isBookGeneration ? 'book generation' : 'conversation'} with context:`, conversationContext);
  
  try {
    const response = await fetch('/api/gpt4', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ context: conversationContext, isBookGeneration }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Received response from GPT-4:', data);
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error in sendToGPT4:', error);
    throw error;
  }
}
