#!/usr/bin/env node
/**
 * User management CLI for the Game Analytics Dashboard.
 *
 * Usage:
 *   node server/manage-users.cjs add <username> [--admin]   # prompts for password
 *   node server/manage-users.cjs remove <username>
 *   node server/manage-users.cjs list
 *   node server/manage-users.cjs set-role <username> <admin|user>
 */

const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const USERS_FILE = path.join(__dirname, 'users.json');
const BCRYPT_ROUNDS = 12;

function loadUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) return [];
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch {
        return [];
    }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

function promptPassword(prompt) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        // On Windows, hiding input isn't reliable, so just prompt normally
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

async function addUser(username) {
    if (!username || username.length < 2) {
        console.error('Username must be at least 2 characters.');
        process.exit(1);
    }

    const users = loadUsers();
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        console.error(`User "${username}" already exists.`);
        process.exit(1);
    }

    const password = await promptPassword('Enter password: ');
    if (!password || password.length < 6) {
        console.error('Password must be at least 6 characters.');
        process.exit(1);
    }

    const confirm = await promptPassword('Confirm password: ');
    if (password !== confirm) {
        console.error('Passwords do not match.');
        process.exit(1);
    }

    const role = process.argv.includes('--admin') ? 'admin' : 'user';
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    users.push({ username, passwordHash, role });
    saveUsers(users);
    console.log(`User "${username}" added as ${role}.`);
}

function removeUser(username) {
    const users = loadUsers();
    const filtered = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
    if (filtered.length === users.length) {
        console.error(`User "${username}" not found.`);
        process.exit(1);
    }
    saveUsers(filtered);
    console.log(`User "${username}" removed.`);
}

function listUsers() {
    const users = loadUsers();
    if (users.length === 0) {
        console.log('No users configured.');
        console.log('Add one with: node server/manage-users.cjs add <username>');
        return;
    }
    console.log(`Users (${users.length}):`);
    users.forEach(u => console.log(`  - ${u.username} (${u.role || 'user'})`));
}

function setRole(username, role) {
    if (!['admin', 'user'].includes(role)) {
        console.error('Role must be "admin" or "user".');
        process.exit(1);
    }
    const users = loadUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) {
        console.error(`User "${username}" not found.`);
        process.exit(1);
    }
    user.role = role;
    saveUsers(users);
    console.log(`User "${username}" is now ${role}.`);
}

const [,, command, username] = process.argv;
const roleArg = process.argv[4];

switch (command) {
    case 'add':
        if (!username) { console.error('Usage: node manage-users.cjs add <username> [--admin]'); process.exit(1); }
        addUser(username);
        break;
    case 'remove':
    case 'delete':
        if (!username) { console.error('Usage: node manage-users.cjs remove <username>'); process.exit(1); }
        removeUser(username);
        break;
    case 'list':
    case 'ls':
        listUsers();
        break;
    case 'set-role':
        if (!username || !roleArg) { console.error('Usage: node manage-users.cjs set-role <username> <admin|user>'); process.exit(1); }
        setRole(username, roleArg);
        break;
    default:
        console.log('Game Analytics Dashboard - User Management');
        console.log('');
        console.log('Commands:');
        console.log('  add <username> [--admin]          Add a new user (prompts for password)');
        console.log('  remove <username>                 Remove a user');
        console.log('  list                              Show all users');
        console.log('  set-role <username> <admin|user>  Change user role');
        break;
}
