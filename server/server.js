import express from "express";
import pg from "pg";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import multer from "multer";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

dotenv.config();

const app = express();
const PORT = 8000;
app.use(express.json());

const db = new pg.Client({
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
  host: process.env.HOST,
  port: process.env.PORT
});
db.connect();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const bucketName = process.env.BUCKET
const bucketRegion = process.env.REGION
const accessKey = process.env.ACCESS_KEY
const secretKey = process.env.SECRET_KEY

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretKey
  },
  region: bucketRegion
})


app.use(cors());


//get za price
app.get("/prica", async (req, res) => {

  try {
    const result = await db.query("SELECT * FROM prica")
    res.json(result.rows);
  } catch (err) {
    console.log(err);
  }
})


//get za tattoo artiste
app.get("/artist", async (req, res) => {

  try {
    const result = await db.query("SELECT * FROM artist")
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



    if (success) {
      const token = jwt.sign({ email }, 'secret', { expiresIn: '1hr' });
      res.json({ 'email': result.rows[0].email, token, email });
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

//login artista
app.post("/loginartista", async (req, res) => {
  const { email, lozinka } = req.body;
  try {
    const result = await db.query("SELECT * FROM artist where email = $1", [email]);

    if (!result.rows.length) return res.json({ detail: 'Artist ne postoji!' });


    const token = jwt.sign({ email }, 'secret', { expiresIn: '1hr' }); //potencijalno prebacit unutar if petlje

    if (lozinka === result.rows[0].lozinka) {
      res.json({ 'Email': result.rows[0].email, token, email });
      console.log("Login uspješan!");
      console.log(result.rows[0].email);
    } else {
      res.json({ detail: "Login neuspješan" });
      console.log("Login neuspješan!");
    }

  } catch (err) {
    console.log(err);
  }
})

//podaci o klijentu koji se pohranjuju u kolacice
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

//podaci o artistu koji se pohranjuju u kolacice
app.get("/artist/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const result = await db.query("SELECT id_artista, ime, prezime, artist_path, profilnaslika FROM artist WHERE email = $1", [email]);

    if (!result.rows.length) return res.status(404).json({ detail: 'Artist ne postoji!' });

    console.log("Podaci o artistu: ", result.rows);
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

//editiranje price klijenata
app.post("/editprica", async (req, res) => {

  const { tekst, id_price, id_klijenta } = req.body;

  try {
    const editiranaPrica = await db.query("UPDATE prica SET tekst = ($1) WHERE id_price=$2 AND id_klijenta=$3", [tekst, id_price, id_klijenta]);
    console.log(editiranaPrica);
  } catch (err) {
    console.log(err);
  }
})

//editiranje prvog teksta artista
app.post("/editprvitekst", async (req, res) => {

  const { tekst, id_artista } = req.body;

  try {
    const editiraniPrviTekst = await db.query("UPDATE artist SET prvi_tekst = ($1) WHERE id_artista=$2", [tekst, id_artista]);
    console.log(editiraniPrviTekst);
  } catch (err) {
    console.log(err);
  }
})

//editiranje prvog teksta artista
app.post("/editdrugitekst", async (req, res) => {

  const { tekst, id_artista } = req.body;

  try {
    const editiraniPrviTekst = await db.query("UPDATE artist SET drugi_tekst = ($1) WHERE id_artista=$2", [tekst, id_artista]);
    console.log(editiraniPrviTekst);
  } catch (err) {
    console.log(err);
  }
})

//editiranje prvog paragrafa u blogu
app.post("/editparagraf1", async (req, res) => {

  const { paragraf1, id_artista } = req.body;

  try {
    const editiraniPrviParagraf = await db.query("UPDATE blog SET paragraf1 = ($1) WHERE id_artista=$2", [paragraf1, id_artista]);
    console.log(editiraniPrviParagraf);
  } catch (err) {
    console.log(err);
  }
})

//editiranje drugog paragrafa u blogu
app.post("/editparagraf2", async (req, res) => {

  const { paragraf2, id_artista } = req.body;

  try {
    const editiraniDrugiParagraf = await db.query("UPDATE blog SET paragraf2 = ($1) WHERE id_artista=$2", [paragraf2, id_artista]);
    console.log(editiraniDrugiParagraf);
  } catch (err) {
    console.log(err);
  }
})

//get za thumbnailove blogova
app.get("/thumbnailovi", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM blogthumbnail")
    const thumbnailovi = [];

    for (const thumbnailslika of result.rows) {
      const getObjectParams = {
        Bucket: bucketName,
        Key: thumbnailslika.thumbnail_naziv_slika
      }
      const command = new GetObjectCommand(getObjectParams);
      const url = await getSignedUrl(s3, command, { expiresIn: 86400 });

      thumbnailovi.push({
        ...thumbnailslika,
        thumbnail_slika: url,
      })
    }
    res.json(thumbnailovi);
  } catch (err) {
    console.log(err);
  }
})

//get za blogove
app.get("/blogovi", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM blog")
    const blogovi = [];

    for (const blogslika of result.rows) {
      const getObjectParams = {
        Bucket: bucketName,
        Key: blogslika.ime_blog_slike
      }
      const command = new GetObjectCommand(getObjectParams);
      const url = await getSignedUrl(s3, command, { expiresIn: 86400 });

      blogovi.push({
        ...blogslika,
        blog_slika: url,
      })
    }
    res.json(blogovi);
  } catch (err) {
    console.log(err);
  }
})

//zahtjev za dobavljanje tetovaza od odredenog artista
app.get("/tetovaze/*", async (req, res) => {
  const artist_path = req.params[0];
  try {
    const result = await db.query("SELECT * FROM slika WHERE artist_path = $1 ORDER BY id_slike ASC", [artist_path]);
    const tetovaze = [];

    for (const slika of result.rows) {

      const getObjectParams = {
        Bucket: bucketName,
        Key: slika.naziv_slike
      }
      const command = new GetObjectCommand(getObjectParams);
      const url = await getSignedUrl(s3, command, { expiresIn: 86400 });

      tetovaze.push({
        ...slika,
        url_slike: url,
      })
    }
    res.json(tetovaze);
  } catch (err) {
    console.log(err);
  }

});

//dodavanje tetovaze
app.post("/dodajtetovazu", upload.single("slika"), async (req, res) => {

  const tetovaza = req.file.originalname;
  const params = {
    Bucket: bucketName,
    Key: tetovaza,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  }
  const command = new PutObjectCommand(params);
  await s3.send(command)

  const url_tetovaze = `https://${bucketName}.s3.${bucketRegion}.amazonaws.com/${tetovaza}`;
  const { id_artista, artist_path } = req.body;

  try {
    const novaTetovaza = await db.query("INSERT INTO slika(naziv_slike, url_slike, id_artista, artist_path) VALUES ($1, $2, $3, $4)",
      [tetovaza, url_tetovaze, id_artista, artist_path]);
    res.json(novaTetovaza);
    console.log("Dodana tetovaža", novaTetovaza.rows);

  } catch (err) {
    console.log(err);
    console.log("Neuspješan prijenos tetovaže u bazu!");
  }

  console.log("Prijenos uspješan!");
})

//brisanje tetovaze
app.post("/izbrisitetovazu", async (req, res) => {

  const { id_slike, id_artista } = req.body;

  console.log("ID-evi: ", id_slike, id_artista);
  try {

    console.log("ID-evi: ", id_slike, id_artista)

    const izbrisanaTetovaza = await db.query("DELETE FROM slika WHERE id_slike = $1 AND id_artista= $2",
      [id_slike, id_artista]);
    res.json(izbrisanaTetovaza);
  } catch (err) {
    console.log(err);
  }
})

//brisanje bloga
app.post("/izbrisiblog", async (req, res) => {

  const { id_artista, naslov } = req.body;

  console.log("ID artista i naslov: ", id_artista, naslov);
  try {


    const izbrisanBlog = await db.query("DELETE FROM blogthumbnail WHERE id_artista = $1 AND naslov= $2",
      [id_artista, naslov]);
    res.json(izbrisanBlog);
  } catch (err) {
    console.log(err);
  }
})


//dodavanje bloga i thumbnaila
app.post("/dodajblogthumbnail", upload.single("slika"), async (req, res) => {

  const thumbnail_naziv_slika = req.file.originalname;
  const params = {
    Bucket: bucketName,
    Key: thumbnail_naziv_slika,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  }
  const command = new PutObjectCommand(params);
  await s3.send(command)

  const thumbnail_slika = `https://${bucketName}.s3.${bucketRegion}.amazonaws.com/${thumbnail_naziv_slika}`;

  const { naslov, uvod, datum, blog_path, ime, prezime, id_artista, profilnaslika } = req.body;

  try {
    const noviThumbnail = await db.query("INSERT INTO blogthumbnail(naslov, uvod, datum, thumbnail_slika, thumbnail_naziv_slika, blog_path, ime, prezime, id_artista, profilnaslika) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
      [naslov, uvod, datum, thumbnail_slika, thumbnail_naziv_slika, blog_path, ime, prezime, id_artista, profilnaslika]);
    res.json(noviThumbnail);
    console.log("Dodani thumbnail: ", noviThumbnail.rows);
  } catch (err) {
    console.log("Neuspješan prijenos podataka za thumbnail!");
    console.log(err);
  }
})


app.post("/dodajblog", upload.single("slika"), async (req, res) => {

  const ime_blog_slike = req.file.originalname;
  const params = {
    Bucket: bucketName,
    Key: ime_blog_slike,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  }
  const command = new PutObjectCommand(params);
  await s3.send(command)
  const blog_slika = `https://${bucketName}.s3.${bucketRegion}.amazonaws.com/${ime_blog_slike}`;

  const { naslov, datum, blog_path, ime, prezime, id_artista, profilnaslika, paragraf1, paragraf2 } = req.body;

  try {
    const noviBlog = await db.query("INSERT INTO blog(naslov, datum, blog_path, paragraf1, blog_slika, ime_blog_slike, paragraf2, ime, prezime, id_artista, profilnaslika) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
      [naslov, datum, blog_path, paragraf1, blog_slika, ime_blog_slike, paragraf2, ime, prezime, id_artista, profilnaslika]);
    res.json(noviBlog);
    console.log("Dodani blog: ", noviBlog.rows);
  } catch (err) {
    console.log("Neuspješan prijenos podataka za blog!");
    console.log(err);
  }
})

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


//stari kod za upload slika
//parametri za sliku koji idu u tablicu blogthumbnail
/* const thumbnail_naziv_slika = req.file.originalname;
  const params = {
    Bucket: bucketName,
    Key: thumbnail_naziv_slika,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  }
  const command = new PutObjectCommand(params);
  await s3.send(command)
  const thumbnail_slika = `https://${bucketName}.s3.${bucketRegion}.amazonaws.com/${thumbnail_naziv_slika}`;

//parametri za poslat sliku koja ide u tablicu blog
  const ime_blog_slike = req.file.originalname;
  const params2 = {
    Bucket: bucketName,
    Key: ime_blog_slike,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  }
  const command2 = new PutObjectCommand(params);
  await s3.send(command)
  const blog_slika = `https://${bucketName}.s3.${bucketRegion}.amazonaws.com/${ime_blog_slike}`;*/


//ISPROBAJ. Ili napravi "/dodajthumbnail" i "/dodajblog" kao zasebne endpointeve i funkciju dodajBlog u frontendu pozovi ako je dodajThumbnail uspješna

/**import express from "express";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const app = express();
const upload = multer();

// Your AWS S3 configuration
const s3 = new S3Client({
// Your AWS credentials and region configuration
});

// Route for adding blog with multiple images
app.post("/dodajblog", upload.array("images", 2), async (req, res) => {
const files = req.files; // Array of uploaded files

// Handle errors if files are not uploaded
if (!files || files.length < 2) {
  return res.status(400).json({ error: "Potrebne su dvije slike!" });
}

try {
  // Uploading files to S3 and getting signed URLs
  const uploadPromises = files.map(async (file) => {
    const params = {
      Bucket: process.env.BUCKET_NAME,
      Key: file.originalname,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    const command = new PutObjectCommand(params);
    await s3.send(command);

    const url = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: file.originalname,
    }), { expiresIn: 86400 });

    return { filename: file.originalname, url };
  });

  const uploadedFiles = await Promise.all(uploadPromises);
  
  // Now you have signed URLs and other form data, you can process it further
  // For example, save the URLs and other form data to your database
  
  return res.status(200).json({ files: uploadedFiles });
} catch (error) {
  console.error("Error uploading files:", error);
  return res.status(500).json({ error: "Internal server error" });
}
});

// Start the server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
console.log(`Server is running on http://localhost:${PORT}`);
}); */