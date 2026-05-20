const express = require('express');
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

// Google Contacts API setup
const { google } = require('googleapis');

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Webhook is live!'
  });
});

// ===================================================
// WEBHOOK
// ===================================================
app.post('/webhook', async (req, res) => {
  try {

    const data = req.body;

    console.log('Full Webhook Data:', JSON.stringify(data, null, 2));

    // Pipedrive webhook meta
    const action = data.meta?.action;
    const entity = data.meta?.entity;

    console.log('Action:', action);
    console.log('Entity:', entity);

    // Check deleted person event
    if (action === 'delete' && entity === 'person') {

      const person = data.previous || {};

      // Name
      let name =
        `${person?.first_name || ''} ${person?.last_name || ''}`.trim();

      // Email
      let email = '';

      if (person?.emails && person.emails.length > 0) {
        email = person.emails[0].value;
      }

      console.log(`Deleted Contact -> Name: ${name} | Email: ${email}`);

      // -----------------------------------
      // DELETE FROM GOOGLE CONTACTS
      // -----------------------------------
      if (email) {
        await deleteFromGoogleContacts(email);
      }

      // -----------------------------------
      // DELETE FROM JOBBER
      // -----------------------------------
      if (name || email) {
        await deleteFromJobber(name, email);
      }
    }

    return res.status(200).json({
      success: true
    });

  } catch (error) {

    console.error('Webhook Error:', error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===================================================
// DELETE FROM GOOGLE CONTACTS
// ===================================================
async function deleteFromGoogleContacts(email) {

  try {

    console.log(`Searching Google Contacts for: ${email}`);

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: [
        'https://www.googleapis.com/auth/contacts'
      ],
    });

    const authClient = await auth.getClient();

    const service = google.people({
      version: 'v1',
      auth: authClient
    });

    // Search contact
    const searchResult = await service.people.searchContacts({
      query: email,
      readMask: 'names,emailAddresses'
    });

    const results = searchResult.data.results || [];

    console.log(`Found ${results.length} Google contacts`);

    // Delete all matched contacts
    for (const result of results) {

      const resourceName = result.person.resourceName;

      console.log(`Deleting Google Contact: ${resourceName}`);

      await service.people.deleteContact({
        resourceName
      });

      console.log(`✅ Deleted Google Contact: ${resourceName}`);
    }

  } catch (error) {

    console.error(
      'Google Contacts Error:',
      error.response?.data || error.message
    );
  }
}

// ===================================================
// DELETE FROM JOBBER
// ===================================================
async function deleteFromJobber(name, email) {

  try {

    const JOBBER_API_KEY = process.env.JOBBER_API_KEY;

    if (!JOBBER_API_KEY) {

      console.log('⚠️ JOBBER_API_KEY not added yet');

      return;
    }

    console.log(`Searching Jobber Client for: ${email}`);

    // Search client
    const searchResponse = await fetch(
      'https://api.getjobber.com/api/graphql',
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

    const clients =
      searchData?.data?.clients?.nodes || [];

    console.log(`Found ${clients.length} Jobber clients`);

    // Delete clients
    for (const client of clients) {

      console.log(`Deleting Jobber Client: ${client.id}`);

      const deleteResponse = await fetch(
        'https://api.getjobber.com/api/graphql',
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

      console.log(
        '✅ Deleted Jobber Client:',
        JSON.stringify(deleteData)
      );
    }

  } catch (error) {

    console.error(
      'Jobber Error:',
      error.response?.data || error.message
    );
  }
}

// ===================================================
// SERVER
// ===================================================
app.listen(PORT, () => {

  console.log(`🚀 Server running on port ${PORT}`);
});
