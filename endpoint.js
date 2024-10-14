import axios from 'axios';

async function requestInterviewBook(subject) {
  const url = 'https://omniscience.tech:444/interview-book';
  const headers = {
    'Content-Type': 'application/json',
  };
  const payload = {
    subject: subject,
  };

  try {
    const response = await axios.post(url, payload, { headers });
    return response.data.pdf_download_link;
  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
    return null;
  }
}

// Example usage with async/await
async function main() {
  const subject = 'Node.js Programming';
  try {
    const pdfLink = await requestInterviewBook(subject);
    if (pdfLink) {
      console.log(`PDF Download Link: ${pdfLink}`);
    } else {
      console.log('Failed to get the PDF download link.');
    }
  } catch (error) {
    console.error(`Unexpected error: ${error.message}`);
  }
}

// Run the main function
main();
