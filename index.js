async function deleteFromGoogleContacts(email) {

  try {

    console.log(`Searching Google Contacts for: ${email}`);

    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

    const { client_id, client_secret, redirect_uris } = credentials.web;

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );

    oAuth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    const service = google.people({
      version: 'v1',
      auth: oAuth2Client
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
