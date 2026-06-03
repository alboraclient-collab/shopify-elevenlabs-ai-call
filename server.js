const express = require("express");
const fetch = require("node-fetch");

const app = express();

app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("AI Call Backend is running");
});

app.post("/shopify-webhook", async (req, res) => {
  try {
    const order = req.body;

    const orderId = order.admin_graphql_api_id;

    const customerName =
      `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();

    const phone =
      order.shipping_address?.phone ||
      order.phone ||
      order.customer?.phone;

    const productName =
      order.line_items?.map(item => item.title).join(", ") || "Produs";

    const totalPrice = order.total_price || "0";

    const address =
      `${order.shipping_address?.address1 || ""}, ${order.shipping_address?.city || ""}, ${order.shipping_address?.province || ""}`;

    console.log("================================");
    console.log("YENI SIPARIS GELDI");
    console.log("Order ID:", orderId);
    console.log("Musteri:", customerName);
    console.log("Telefon:", phone);
    console.log("Urun:", productName);
    console.log("Adres:", address);
    console.log("================================");

    if (!phone) {
      console.log("Telefon bulunamadi.");
      return res.status(200).send("No phone");
    }

    const elevenResponse = await fetch(
      "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          agent_id: process.env.ELEVENLABS_AGENT_ID,
          agent_phone_number_id:
            process.env.ELEVENLABS_PHONE_NUMBER_ID,
          to_number: phone,
          conversation_initiation_client_data: {
            dynamic_variables: {
              customer_name: customerName,
              product_name: productName,
              total_price: totalPrice,
              shipping_address: address,
              shopify_order_id: orderId
            }
          }
        })
      }
    );

    const elevenText = await elevenResponse.text();

    console.log("ELEVENLABS STATUS:", elevenResponse.status);
    console.log("ELEVENLABS RESPONSE:");
    console.log(elevenText);

    if (!elevenResponse.ok) {
      console.log("Arama baslatilamadi.");
      return res.status(200).send("ElevenLabs error");
    }

    console.log("Arama baslatildi.");

    res.status(200).send("OK");
  } catch (err) {
    console.error("WEBHOOK HATASI:");
    console.error(err);

    res.status(500).send("ERROR");
  }
});

app.post("/confirm-order", async (req, res) => {
  try {
    const { shopify_order_id, confirmed } = req.body;

    console.log("Confirm endpoint cagrildi:");
    console.log(req.body);

    if (!shopify_order_id) {
      return res.status(400).send("Missing order id");
    }

    if (confirmed !== true) {
      return res.status(200).send("Not confirmed");
    }

    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE}.myshopify.com/admin/api/2026-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token":
            process.env.SHOPIFY_ADMIN_TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: `
            mutation tagsAdd($id: ID!, $tags: [String!]!) {
              tagsAdd(id: $id, tags: $tags) {
                node {
                  id
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `,
          variables: {
            id: shopify_order_id,
            tags: ["AI Onaylandı"]
          }
        })
      }
    );

    const data = await response.text();

    console.log("SHOPIFY TAG SONUCU:");
    console.log(data);

    res.status(200).send("Tagged");
  } catch (err) {
    console.error("TAG HATASI:");
    console.error(err);

    res.status(500).send("ERROR");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
