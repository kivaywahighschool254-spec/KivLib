/**
 * Kivaywa High School LMS - Backend Integration Engine & REST API
 * Technology Stack: Node.js / Express.js / MongoDB Atlas (Mongoose ODM)
 * Architecture: 100% Database-Driven Framework (Production Grade)
 * Version: 2.1 — Barcode Scanner Optimized
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================================================
// 1. Core Production Middleware Setup
// ==========================================================================
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Lightweight request logger — helpful when debugging scans from mobile
app.use((req, res, next) => {
    const t = new Date().toISOString().slice(11, 19);
    console.log(`[${t}] ${req.method} ${req.originalUrl}`);
    next();
});

// Health check — phones can ping this to verify reachability
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'online',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ==========================================================================
// 2. MongoDB Atlas Connection Infrastructure
// ==========================================================================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://MedAI:Griff2009.@medai.qjvleue.mongodb.net/?appName=MedAI";

mongoose.connect(MONGO_URI)
    .then(() => console.log('🚀 Successfully established pipeline link with MongoDB Atlas Cluster.'))
    .catch(err => {
        console.error('❌ MongoDB Connection Failure Structural Exception:', err.message);
        process.exit(1);
    });

// ==========================================================================
// 3. Database Schema Layout Context Maps (Mongoose Models)
// ==========================================================================

// --- Book Catalog Inventory Document Structure ---
const BookSchema = new mongoose.Schema({
    title:    { type: String, required: true, trim: true },
    author:   { type: String, required: true, trim: true },
    isbn:     { type: String, required: true, unique: true, trim: true },
    category: { type: String, required: true },
    qty:      { type: Number, required: true, min: 0, default: 1 }
}, { timestamps: true });

// Index on ISBN for fast barcode-scan lookups
BookSchema.index({ isbn: 1 });
BookSchema.index({ title: 1 });

const Book = mongoose.model('Book', BookSchema);

// --- Borrower Transaction Log Document Structure ---
const BorrowedSchema = new mongoose.Schema({
    borrowerType:     { type: String, enum: ['Student', 'Teacher/Staff'], default: 'Student', required: true },
    admNo:            { type: String, required: true, trim: true },
    name:             { type: String, required: true, trim: true },
    form:             { type: String, required: true },
    bookTitle:        { type: String, required: true, trim: true },
    bookIsbn:         { type: String, trim: true },   // NEW — captured when barcode is scanned
    issueDate:        { type: String, required: true },
    dueDate:          { type: String, required: true },
    status:           { type: String, enum: ['Active', 'Overdue'], default: 'Active' },
    conditionDeficit: { type: String, default: 'Good' },
    fineAmount:       { type: Number, default: 0 }
}, { timestamps: true });

BorrowedSchema.index({ admNo: 1, bookTitle: 1 });
BorrowedSchema.index({ admNo: 1, status: 1 });

const Borrowed = mongoose.model('Borrowed', BorrowedSchema);

// ==========================================================================
// 4. Auxiliary System Calculation Routines (Middleware Engine)
// ==========================================================================

async function computeRealtimeOverdueStatus() {
    try {
        const activeLogs = await Borrowed.find({ status: 'Active' });
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let log of activeLogs) {
            const dueDate = new Date(log.dueDate);
            dueDate.setHours(0, 0, 0, 0);

            if (today > dueDate) {
                log.status = 'Overdue';

                const diffTime = Math.abs(today - dueDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                log.fineAmount = diffDays * 20;

                await log.save();
            }
        }
    } catch (err) {
        console.error("System Engine Error calculating temporal offsets: ", err.message);
    }
}

// ==========================================================================
// 5. REST API Controller Routes Framework
// ==========================================================================

// --------------------------------------------------------------------------
// GET: Fetch Active Inventory Catalog Logs
// --------------------------------------------------------------------------
app.get('/api/books', async (req, res) => {
    try {
        const books = await Book.find().sort({ title: 1 });
        res.status(200).json(books);
    } catch (err) {
        res.status(500).json({ error: "Inventory sync fault occurred on remote lookup.", details: err.message });
    }
});

// --------------------------------------------------------------------------
// GET: Lookup a single book by ISBN (used by barcode scanner autofill)
// --------------------------------------------------------------------------
app.get('/api/books/isbn/:isbn', async (req, res) => {
    try {
        const book = await Book.findOne({ isbn: req.params.isbn.trim() });
        if (!book) {
            return res.status(404).json({ error: "No book found with that ISBN." });
        }
        res.status(200).json(book);
    } catch (err) {
        res.status(500).json({ error: "ISBN lookup fault.", details: err.message });
    }
});

// --------------------------------------------------------------------------
// POST: Commit New Book Profile to Database Catalog
// --------------------------------------------------------------------------
app.post('/api/books', async (req, res) => {
    try {
        const { title, author, isbn, category, qty } = req.body;

        if (!title || !author || !isbn || !category) {
            return res.status(400).json({ error: "Missing required fields: title, author, isbn, category." });
        }

        const targetExists = await Book.findOne({ isbn: String(isbn).trim() });
        if (targetExists) {
            return res.status(400).json({ error: "A book with this ISBN already exists." });
        }

        const addedBook = new Book({
            title: String(title).trim(),
            author: String(author).trim(),
            isbn: String(isbn).trim(),
            category,
            qty: Math.max(0, parseInt(qty) || 1)
        });
        await addedBook.save();
        res.status(201).json(addedBook);
    } catch (err) {
        res.status(400).json({ error: "Payload verification check dropped data mapping rules.", details: err.message });
    }
});

// --------------------------------------------------------------------------
// DELETE: Purge Specific Book Profile configuration
// --------------------------------------------------------------------------
app.delete('/api/books/:isbn', async (req, res) => {
    try {
        const deletedBook = await Book.findOneAndDelete({ isbn: req.params.isbn });
        if (!deletedBook) {
            return res.status(404).json({ error: "Target catalog artifact item not found inside database schema maps." });
        }
        res.status(200).json({ message: "Book configuration profile wiped out smoothly." });
    } catch (err) {
        res.status(500).json({ error: "Internal driver exception processing profile wipe.", details: err.message });
    }
});

// --------------------------------------------------------------------------
// GET: Query All Borrowed Transaction Logs
// --------------------------------------------------------------------------
app.get('/api/borrowed', async (req, res) => {
    try {
        await computeRealtimeOverdueStatus();
        const borrowings = await Borrowed.find().sort({ createdAt: -1 });
        res.status(200).json(borrowings);
    } catch (err) {
        res.status(500).json({ error: "Registry query structural transaction block error.", details: err.message });
    }
});

// --------------------------------------------------------------------------
// POST: Issue/Authorize Book Borrowing and Deduct Quantity
// --------------------------------------------------------------------------
app.post('/api/borrowed', async (req, res) => {
    try {
        const { borrowerType, admNo, name, form, bookTitle, issueDate, dueDate } = req.body;

        if (!admNo || !name || !form || !bookTitle || !issueDate || !dueDate) {
            return res.status(400).json({ error: "Missing required fields." });
        }

        const escapedTitle = String(bookTitle).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

        // Duplicate-active check (same student, same title)
        const activeCheck = await Borrowed.findOne({
            admNo,
            bookTitle: { $regex: new RegExp(`^${escapedTitle}$`, 'i') }
        });
        if (activeCheck) {
            return res.status(400).json({
                error: `Outstanding transaction detected. "${admNo}" currently holds a copy of "${activeCheck.bookTitle}".`
            });
        }

        // Case-insensitive book lookup
        const bookMatch = await Book.findOne({
            title: { $regex: new RegExp(`^${escapedTitle}$`, 'i') }
        });
        if (!bookMatch) {
            return res.status(404).json({
                error: `The book titled "${bookTitle}" does not match any current stock profile.`
            });
        }
        if (bookMatch.qty < 1) {
            return res.status(400).json({
                error: `Insufficient stock. "${bookMatch.title}" is fully checked out.`
            });
        }

        // Deduct one copy
        bookMatch.qty -= 1;
        await bookMatch.save();

        const authorizedBorrowing = new Borrowed({
            borrowerType: borrowerType || 'Student',
            admNo,
            name,
            form,
            bookTitle: bookMatch.title,
            bookIsbn:  bookMatch.isbn,   // record ISBN for future scans
            issueDate,
            dueDate,
            status: "Active"
        });
        await authorizedBorrowing.save();

        res.status(201).json(authorizedBorrowing);
    } catch (err) {
        res.status(400).json({ error: "Issuance processing operation parameters faulted.", details: err.message });
    }
});

// --------------------------------------------------------------------------
// DELETE: Check-In/Mark Return and Credit Volume Back to Stock
// --------------------------------------------------------------------------
app.delete('/api/borrowed/:idOrAdmNo', async (req, res) => {
    try {
        const identifier = req.params.idOrAdmNo;

        let activeIssue = null;
        if (mongoose.Types.ObjectId.isValid(identifier)) {
            activeIssue = await Borrowed.findById(identifier);
        }
        if (!activeIssue) {
            activeIssue = await Borrowed.findOne({ admNo: identifier });
        }

        if (!activeIssue) {
            return res.status(404).json({ error: "No active transaction matched this identifier." });
        }

        // Credit stock back
        await Book.findOneAndUpdate(
            { title: activeIssue.bookTitle },
            { $inc: { qty: 1 } }
        );

        await Borrowed.deleteOne({ _id: activeIssue._id });
        res.status(200).json({ message: "Check-in complete. Stock credited." });
    } catch (err) {
        res.status(500).json({ error: "Crash condition logged on collection tracking arrays.", details: err.message });
    }
});

// ==========================================================================
// 6. Application Startup Runtime Engine
// ==========================================================================
app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(` 🔥 KIVAYWA LMS CONTROL CENTER RUNNING ON PORT ${PORT}`);
    console.log(` 📚 Barcode Scanner API: /api/books/isbn/:isbn enabled`);
    console.log(`================================================================`);
});
