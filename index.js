const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Google Contacts API setup
const { google } = require('googleapis');

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Webhook is live!' });
});

app.post('/webhook', async (req, res) => {
  try {
    const data = req.body;
    const eventType = data.event;

    console.log('Event received:', eventType);
    console.log('Data:', JSON.stringify(data));

    if (eventType === 'deleted.person') {
      const person = data.previous;

      let name = person?.name || '';
      let email = '';

      if (person?.email && person.email.length > 0) {
        email = person.email[0].value;
      }

      console.log(`Deleted Contact - Name: ${name} | Email: ${email}`);

      // Delete from Google Contacts
      if (email) {
        await deleteFromGoogleContacts(email);
      }

      // Delete from Jobber
      if (name || email) {
        await deleteFromJobber(name, email);
      }
    }

    res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('Error:', error);
    res.status(200).json({ status: 'error', message: error.toString() });
  }
});

// -----------------------------------------------
// DELETE FROM GOOGLE CONTACTS
// -----------------------------------------------
async function deleteFromGoogleContacts(email) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: ['https://www.googleapis.com/auth/contacts'],
    });

    const service = google.people({ version: 'v1', auth });

    // Search for contact by email
    const searchResult = await service.people.searchContacts({
      query: email,
      readMask: 'names,emailAddresses',
    });

    const results = searchResult.data.results || [];
    console.log(`Found ${results.length} contacts for email: ${email}`);

    for (const result of results) {
      const resourceName = result.person.resourceName;
      await service.people.deleteContact({ resourceName });
      console.log(`✅ Deleted from Google Contacts: ${resourceName}`);
    }

  } catch (error) {
    console.error('Google Contacts Error:', error.message);
  }
}

// -----------------------------------------------
// DELETE FROM JOBBER
// -----------------------------------------------
async function deleteFromJobber(name, email) {
  try {
    const JOBBER_API_KEY = process.env.JOBBER_API_KEY;

    if (!JOBBER_API_KEY) {
      console.log('Jobber API key not set yet');
      return;
    }

    // Search for client by email
    const searchResponse = await fetch(
      `https://api.getjobber.com/api/graphql`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${JOBBER_API_KEY}`,
          'X-JOBBER-GRAPHQL-VERSION': '2024-01-15',
        },
        body: JSON.stringify({
          query: `
            query {
              clients(filter: { email: "${email}" }) {
                nodes {
                  id
                  name
                }
              }
            }
          `
        })
      }
    );

    const searchData = await searchResponse.json();
    const clients = searchData?.data?.clients?.nodes || [];

    console.log(`Found ${clients.length} Jobber clients for email: ${email}`);

    for (const client of clients) {
      const deleteResponse = await fetch(
        `https://api.getjobber.com/api/graphql`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${JOBBER_API_KEY}`,
            'X-JOBBER-GRAPHQL-VERSION': '2024-01-15',
          },
          body: JSON.stringify({
            query: `
              mutation {
                clientDelete(id: "${client.id}") {
                  deletedClientId
                }
              }
            `
          })
        }
      );

      const deleteData = await deleteResponse.json();
      console.log(`✅ Deleted from Jobber:`, deleteData);
    }

  } catch (error) {
    console.error('Jobber Error:', error.message);
  }
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
