const express = require('express');
const { google } = require('googleapis');

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

// ======================================
// HOME
// ======================================
app.get('/', (req, res) => {

  res.json({
    success: true,
    message: 'Webhook server is live 🚀'
  });

});

// ======================================
// JOBBER AUTH CALLBACK
// ======================================
app.get('/jobber/callback', async (req, res) => {

  try {

    const code = req.query.code;

    console.log('Authorization Code:', code);

    const response = await fetch(
      'https://api.getjobber.com/api/oauth/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({

          client_id:
            process.env.JOBBER_CLIENT_ID,

          client_secret:
            process.env.JOBBER_CLIENT_SECRET,

          grant_type: 'authorization_code',

          code: code,

          redirect_uri:
            'https://pipedrive-delete-sync.onrender.com/jobber/callback'
        })
      }
    );

    const text = await response.text();

    console.log('JOBBER RAW RESPONSE:', text);
    
    res.send(text);

  } catch (error) {

    console.log(
      'Jobber Auth Error:',
      error.message
    );

    res.status(500).json({
      error: error.message
    });
  }
});

// ======================================
// WEBHOOK
// ======================================
app.post('/webhook', async (req, res) => {

  try {

    const data = req.body;

    console.log(
      'Full Webhook Data:',
      JSON.stringify(data, null, 2)
    );

    const action = data.meta?.action;
    const entity = data.meta?.entity;

    console.log('Action:', action);
    console.log('Entity:', entity);

    // ONLY PERSON DELETE
    if (action === 'delete' && entity === 'person') {

      const person = data.previous || {};

      let name =
        `${person.first_name || ''} ${person.last_name || ''}`.trim();

      let email = '';

      if (
        person.emails &&
        person.emails.length > 0
      ) {
        email = person.emails[0].value;
      }

      console.log(
        `Deleted Contact -> Name: ${name} | Email: ${email}`
      );

      // DELETE FROM GOOGLE
      if (email) {
        await deleteFromGoogleContacts(email);
      }

      // DELETE FROM JOBBER
      if (name || email) {
        await deleteFromJobber(name, email);
      }
    }

    return res.status(200).json({
      success: true
    });

  } catch (error) {

    console.error(
      'Webhook Error:',
      error.message
    );

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ======================================
// GOOGLE CONTACT DELETE
// ======================================
async function deleteFromGoogleContacts(email) {

  try {

    console.log(
      `Searching Google Contacts for: ${email}`
    );

    // READ GOOGLE JSON
    const credentials = JSON.parse(
      process.env.GOOGLE_CREDENTIALS
    );

    const {
      client_id,
      client_secret,
      redirect_uris
    } = credentials.web;

    // CREATE OAUTH CLIENT
    const oAuth2Client =
      new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );

    // SET REFRESH TOKEN
    oAuth2Client.setCredentials({
      refresh_token:
        process.env.GOOGLE_REFRESH_TOKEN
    });

    // PEOPLE API
    const service = google.people({
      version: 'v1',
      auth: oAuth2Client
    });

    // SEARCH CONTACT
    const searchResult =
      await service.people.searchContacts({
        query: email,
        readMask: 'names,emailAddresses'
      });

    const results =
      searchResult.data.results || [];

    console.log(
      `Found ${results.length} Google contacts`
    );

    // DELETE CONTACTS
    for (const result of results) {

      const resourceName =
        result.person.resourceName;

      console.log(
        `Deleting Google Contact: ${resourceName}`
      );

      await service.people.deleteContact({
        resourceName
      });

      console.log(
        `✅ Deleted Google Contact: ${resourceName}`
      );
    }

  } catch (error) {

    console.error(
      'Google Contacts Error:',
      error.response?.data || error.message
    );
  }
}

// ======================================
// JOBBER DELETE
// ======================================
async function deleteFromJobber(name, email) {

  try {

    const JOBBER_ACCESS_TOKEN =
      process.env.JOBBER_ACCESS_TOKEN;

    if (!JOBBER_ACCESS_TOKEN) {

      console.log(
        '⚠️ JOBBER_ACCESS_TOKEN not added yet'
      );

      return;
    }

    console.log(
      `Searching Jobber Client for: ${email}`
    );

    // SEARCH CLIENT
    const searchResponse = await fetch(
      'https://api.getjobber.com/api/graphql',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization':
            `Bearer ${JOBBER_ACCESS_TOKEN}`,
          'X-JOBBER-GRAPHQL-VERSION':
            '2023-11-15',
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

    const searchData =
      await searchResponse.json();

    console.log(
      'Jobber Search Response:',
      JSON.stringify(searchData, null, 2)
    );

    const clients =
      searchData?.data?.clients?.nodes || [];

    console.log(
      `Found ${clients.length} Jobber clients`
    );

    // DELETE CLIENTS
    for (const client of clients) {

      console.log(
        `Deleting Jobber Client: ${client.id}`
      );

      const deleteResponse = await fetch(
        'https://api.getjobber.com/api/graphql',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization':
              `Bearer ${JOBBER_ACCESS_TOKEN}`,
            'X-JOBBER-GRAPHQL-VERSION':
              '2024-01-15',
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

      const deleteData =
        await deleteResponse.json();

      console.log(
        '✅ Deleted Jobber Client:',
        JSON.stringify(deleteData, null, 2)
      );
    }

  } catch (error) {

    console.error(
      'Jobber Error:',
      error.response?.data || error.message
    );
  }
}

// ======================================
// SERVER
// ======================================
app.listen(PORT, () => {

  console.log(
    `🚀 Server running on port ${PORT}`
  );

});
