const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require("mongodb");
const { default: Stripe } = require("stripe");
require("dotenv").config();
const nodemailer = require("nodemailer");

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// middlewire
app.use(cors());
app.use(express.json());

//nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// EMAIL FUNCTION
// ========================================

const sendGiftCardEmail = async (giftCard) => {
  try {
    const info = await transporter.sendMail({
      from: `"Locals Coffee" <${process.env.EMAIL_USER}>`,
      to: giftCard.confirmEmail,

      subject: "Your Gift Card 🎁",

      html: `
        <div style="font-family: Arial; padding: 20px;">
          <h1>You received a Gift Card 🎁</h1>

          <h2>Amount: $${giftCard.amount}</h2>

          <p><strong>Gift Code:</strong> ${giftCard.code}</p>

          <p><strong>From:</strong> ${giftCard.senderName}</p>

          <p><strong>Message:</strong> ${giftCard.message}</p>
        </div>
      `,
    });

    console.log("EMAIL SENT SUCCESSFULLY");
    console.log(info);
  } catch (error) {
    console.error("EMAIL ERROR:");
    console.error(error);
  }
};

// mongodb connection

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.u9lypro.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("localCoffeeDB");
    const menuCollection = db.collection("menu");
    const announcementCollection = db.collection("announcement");
    const userCollection = db.collection("user");
    const cartCollection = db.collection("cart");
    const giftCardCollection = db.collection("giftCard");

    // MENU API
    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    // ANNOUNCEMENT API
    app.get("/announcement", async (req, res) => {
      const result = await announcementCollection.find().toArray();
      res.send(result);
    });

    // USER API
    app.get("/user", async (req, res) => {
      const result = await userCollection.find().toArray();
    });

    app.post("/user", async (req, res) => {
      const email = req.body.email;
      const existUser = await userCollection.findOne({ email });

      if (existUser) {
        return res
          .send(200)
          .send({ message: "User Already Exist", inserted: false });
      }

      const user = req.body;
      const result = await userCollection.insertOne(user);
      return res.send(result);
    });

    // CART API

    app.get("/cart", async (req, res) => {
      const result = await cartCollection.find().toArray();
      res.send(result);
    });

    app.get("/cart/:email", async (req, res) => {
      const email = req.params.email;

      const result = await cartCollection
        .find({ email })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    app.post("/cart", async (req, res) => {
      const cartItems = req.body;
      const result = await cartCollection.insertOne(cartItems);
      return res.send(result);
    });

    // app.patch("/cart/cancel/:id", async (req, res) => {
    //   const id = req.params.id;

    //   const result = await cartCollection.updateOne(
    //     { _id: new ObjectId(id) },
    //     {
    //       $set: {
    //         status: "cancelled",
    //       },
    //     },
    //   );

    //   res.send(result);
    // });

    app.patch("/cart/cancel/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await cartCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status: "cancelled",
              cancelledAt: new Date(),
            },
          },
        );

        res.send({
          success: true,
          message: "Order cancelled successfully",
          result,
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Failed to cancel order",
        });
      }
    });

    app.post("/create-payment-intent", async (req, res) => {
      const { totalPrice } = req.body;

      const amount = parseInt(totalPrice * 100); // Stripe uses cents

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // GIFT CARD API
    app.get("/giftCard", async(req, res) => {
      const result = await giftCardCollection.find().toArray();
      res.send(result);
    })

    app.get("/giftCard", async (req, res) => {
      const email = req.params.email;

      const result = await giftCardCollection
        .find({ email })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    app.post("/giftCard", async (req, res) => {
      const data = req.body;

      // my unique giftCard code
      const code =
        "GC-" + Math.random().toString(36).substring(2, 10).toUpperCase();

      const giftCard = {
        ...data,
        code,
        status: "active",
      };
      const result = await giftCardCollection.insertOne(giftCard);
      // Send Email
      await sendGiftCardEmail(giftCard);

      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Local Coffee Server is Running");
});

app.listen(port, () => {
  console.log("Server is running on Port ", port);
});
