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
    const customerName = `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();
    const phone = order.shipping_address?.phone || order.phone || order.customer?.phone;
    const productName = order.line_items?.map(i => i.title).join(", ");
    const totalPrice = order.total_price;
    const address = `${order.shipping_address?.address1 || ""}, ${order.shipping_address?.city || ""}, ${order.shipping_address?.province || ""}`;

    if (!phone) {
      console.log("Telefon yok, arama yapılmadı.");
      return res.status(200).send("No phone");
    }

    await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        agent_id: process.env.ELEVENLABS_AGENT_ID,
        agent_phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
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
    });

    console.log("Arama başlatıldı:", phone);
    res.status(200).send("Call started");
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).send("Error");
  }
});

app.post("/confirm-order", async (req, res) => {
  try {
    const { shopify_order_id, confirmed } = req.body;

    if (!shopify_order_id || confirmed !== true) {
      return res.status(200).send("Not confirmed");
    }

    const response = await fetch(`https://${process.env.SHOPIFY_STORE}.myshopify.com/admin/api/2026-01/graphql.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
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
    });

    const data = await response.json();
    console.log("Shopify tag sonucu:", data);

    res.status(200).send("Tagged");
  } catch (error) {
    console.error("Confirm error:", error);
    res.status(500).send("Error");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
