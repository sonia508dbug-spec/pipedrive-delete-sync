const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

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

      // Log success
      console.log(`✅ Delete sync triggered for: ${name} | ${email}`);
    }

    res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('Error:', error);
    res.status(200).json({ status: 'error', message: error.toString() });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
