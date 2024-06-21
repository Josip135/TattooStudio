import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();


const app = express();
const PORT = 8000;

const db = new pg.Client({
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
  host: process.env.HOST,
  port: process.env.PORT
});
db.connect();

app.use(cors());
app.use(express.json());

//get za price
app.get("/prica", async (req, res) => {

  try {
    const result = await db.query("SELECT * FROM prica")
    res.json(result.rows);
  } catch (err) {
    console.log(err);
  }
})





//registracija klijenta
app.post("/registracijaklijenta", async (req, res) => {
  const { email, ime, prezime, lozinka } = req.body;

  try {
    //const saltRounds = bcrypt.genSaltSync(10);
    const saltRounds = 10;
    const lozinka_klijenta = bcrypt.hashSync(lozinka, saltRounds);

    const signedUser = await db.query("INSERT INTO klijent (email_klijenta, ime_klijenta, prezime_klijenta, lozinka_klijenta) VALUES ($1, $2, $3, $4)",
      [email, ime, prezime, lozinka_klijenta]);

    const token = jwt.sign({ email }, 'secret', { expiresIn: '1hr' });
    res.json({ email, token });


  } catch (err) {
    console.log(err);
    if (err) {
      res.json({ detail: err.detail })
    }
  }
  console.log("Uspješna registracija!");
})

//login klijenta
app.post("/loginklijenta", async (req, res) => {
  const { email, lozinka } = req.body;
  try {
    const result = await db.query("SELECT * FROM klijent where email_klijenta = $1", [email]);

    if (!result.rows.length) return res.json({ detail: 'Korisnik ne postoji!' });


    const success = await bcrypt.compare(lozinka, result.rows[0].lozinka_klijenta);
    const token = jwt.sign({ email }, 'secret', { expiresIn: '1hr' }); //potencijalno prebacit unutar if petlje

    if (success) {
      res.json({ 'email': result.rows[0].email_klijenta, token });
      console.log("Login uspješan!");
      console.log(result.rows);
    } else {
      res.json({ detail: "Login neuspješan" });
      console.log("Login neuspješan!");
    }

  } catch (err) {
    console.log(err);
  }
})

app.get("/klijent/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const result = await db.query("SELECT id_klijenta, email_klijenta, ime_klijenta, prezime_klijenta FROM klijent WHERE email_klijenta = $1", [email]);

    if (!result.rows.length) return res.status(404).json({ detail: 'Korisnik ne postoji!' });

    res.json(result.rows[0]);
  } catch (err) {
    console.log(err);
    res.status(500).json({ detail: 'Greška na serveru' });
  }
});


//dodaj novu pricu
app.post("/dodajpricu", async (req, res) => {
  const { tekst, id_klijenta, ime_klijenta, prezime_klijenta } = req.body;
  console.log("Dobiveni podaci: ", tekst, id_klijenta, ime_klijenta, prezime_klijenta);

  try {
    const novaPrica = await db.query("INSERT INTO prica(tekst, id_klijenta, ime_klijenta, prezime_klijenta) VALUES ($1, $2, $3, $4)",
      [tekst, id_klijenta, ime_klijenta, prezime_klijenta]);
    res.json(novaPrica);
    console.log(novaPrica.rows);

  } catch (err) {
    console.log(err);
    console.log("Neuspješan prijenos priče!");
  }
})


//brisanje price klijenta
app.post("/izbrisipricu", async (req, res) => {

  const { id_price, id_klijenta } = req.body;

  console.log("ID-evi: ", id_price, id_klijenta);
  try {
    const izbrisanaPrica = await db.query("DELETE FROM prica WHERE id_price = $1 and id_klijenta= $2",
      [id_price, id_klijenta]);
    res.json(izbrisanaPrica);
  } catch (err) {
    console.log(err);
  }
})

app.post("/editprica", async (req, res) => {

  const { tekst, id_price, id_klijenta } = req.body;

  try {
    const editiranaPrica = await db.query("UPDATE prica SET tekst = ($1) WHERE id_price=$2 AND id_klijenta=$3", [tekst, id_price, id_klijenta]);
    console.log(editiranaPrica);
  } catch (err) {
    console.log(err);
  }
})

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));