import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Хранилище данных (в реальном проекте нужно использовать БД)
let users = new Map(); // {userId: {username, passwordHash, avatar, friends: []}}
let messages = new Map(); // {chatId: [messages]}
let sessions = new Map(); // {socketId: userId}

// Генерация chatId для личных сообщений
function generateChatId(user1, user2) {
    return [user1, user2].sort().join('_');
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Регистрация
    socket.on('register', async (data) => {
        try {
            if (Array.from(users.values()).find(u => u.username === data.username)) {
                socket.emit('register_error', 'Имя пользователя уже занято');
                return;
            }

            const passwordHash = await bcrypt.hash(data.password, 10);
            const userId = uuidv4();
            
            const user = {
                id: userId,
                username: data.username,
                passwordHash: passwordHash,
                avatar: data.avatar || https://ui-avatars.com/api/?name=${encodeURIComponent(data.username)}&background=667eea&color=fff,
                friends: [],
                friendRequests: []
            };

            users.set(userId, user);
            sessions.set(socket.id, userId);

            socket.emit('register_success', {
                user: {
                    id: userId,
                    username: user.username,
                    avatar: user.avatar
                }
            });

            io.emit('users_update', Array.from(users.values()).map(u => ({
                id: u.id,
                username: u.username,
                avatar: u.avatar,
                online: Array.from(sessions.values()).includes(u.id)
            })));

        } catch (error) {
            socket.emit('register_error', 'Ошибка регистрации');
        }
    });

    // Вход
    socket.on('login', async (data) => {
        try {
            const user = Array.from(users.values()).find(u => u.username === data.username);
            if (!user) {
                socket.emit('login_error', 'Пользователь не найден');
                return;
            }

            const validPassword = await bcrypt.compare(data.password, user.passwordHash);
            if (!validPassword) {
                socket.emit('login_error', 'Неверный пароль');
                return;
            }

            sessions.set(socket.id, user.id);

            socket.emit('login_success', {
                user: {
                    id: user.id,
                    username: user.username,
                    avatar: user.avatar,
                    friends: user.friends
                },
                friends: user.friends.map(friendId => {
                    const friend = users.get(friendId);
                    return {
                        id: friend.id,
                        username: friend.username,
                        avatar: friend.avatar,
                        online: Array.from(sessions.values()).includes(friend.id)
                    };
                })
            });

            io.emit('users_update', Array.from(users.values()).map(u => ({
                id: u.id,
                username: u.username,
                avatar: u.avatar,
                online: Array.from(sessions.values()).includes(u.id)
            })));
} catch (error) {
            socket.emit('login_error', 'Ошибка входа');
        }
    });

    // Поиск пользователей
    socket.on('search_users', (query) => {
        const currentUserId = sessions.get(socket.id);
        const currentUser = users.get(currentUserId);
        
        const results = Array.from(users.values())
            .filter(u => 
                u.id !== currentUserId && 
                !currentUser.friends.includes(u.id) &&
                u.username.toLowerCase().includes(query.toLowerCase())
            )
            .map(u => ({
                id: u.id,
                username: u.username,
                avatar: u.avatar
            }));

        socket.emit('search_results', results);
    });

    // Отправка заявки в друзья
    socket.on('send_friend_request', (targetUserId) => {
        const currentUserId = sessions.get(socket.id);
        const targetUser = users.get(targetUserId);

        if (targetUser && !targetUser.friendRequests.includes(currentUserId)) {
            targetUser.friendRequests.push(currentUserId);
            socket.emit('friend_request_sent');
            
            // Уведомление целеому пользователю, если он онлайн
            const targetSocket = findSocketByUserId(targetUserId);
            if (targetSocket) {
                targetSocket.emit('new_friend_request', {
                    from: users.get(currentUserId).username,
                    fromId: currentUserId
                });
            }
        }
    });

    // Принятие заявки в друзья
    socket.on('accept_friend_request', (fromUserId) => {
        const currentUserId = sessions.get(socket.id);
        const currentUser = users.get(currentUserId);
        const fromUser = users.get(fromUserId);

        if (currentUser.friendRequests.includes(fromUserId)) {
            // Удаляем из заявок
            currentUser.friendRequests = currentUser.friendRequests.filter(id => id !== fromUserId);
            
            // Добавляем в друзья
            if (!currentUser.friends.includes(fromUserId)) {
                currentUser.friends.push(fromUserId);
            }
            if (!fromUser.friends.includes(currentUserId)) {
                fromUser.friends.push(currentUserId);
            }

            // Обновляем обоих пользователей
            socket.emit('friend_added', {
                id: fromUser.id,
                username: fromUser.username,
                avatar: fromUser.avatar,
                online: Array.from(sessions.values()).includes(fromUser.id)
            });

            const fromSocket = findSocketByUserId(fromUserId);
            if (fromSocket) {
                fromSocket.emit('friend_added', {
                    id: currentUser.id,
                    username: currentUser.username,
                    avatar: currentUser.avatar,
                    online: true
                });
            }
        }
    });

    // Личные сообщения
    socket.on('private_message', (data) => {
        const currentUserId = sessions.get(socket.id);
        const currentUser = users.get(currentUserId);
        
        if (!currentUser.friends.includes(data.to)) {
            socket.emit('message_error', 'Этот пользователь не в ваших друзьях');
            return;
        }

        const chatId = generateChatId(currentUserId, data.to);
        const message = {
            id: uuidv4(),
            from: currentUserId,
            to: data.to,
            text: data.text,
            time: new Date().toLocaleTimeString(),
            timestamp: Date.now()
        };

        if (!messages.has(chatId)) {
            messages.set(chatId, []);
        }
        messages.get(chatId).push(message);

        // Отправляем отправителю
        socket.emit('new_private_message', message);

        // Отправляем получателю
        const targetSocket = findSocketByUserId(data.to);
        if (targetSocket) {
            targetSocket.emit('new_private_message', message);
        }
    });
// Загрузка истории сообщений
    socket.on('load_chat_history', (friendId) => {
        const currentUserId = sessions.get(socket.id);
        const chatId = generateChatId(currentUserId, friendId);
        
        if (messages.has(chatId)) {
            socket.emit('chat_history', {
                friendId: friendId,
                messages: messages.get(chatId)
            });
        }
    });

    // Общие сообщения
    socket.on('global_message', (text) => {
        const currentUserId = sessions.get(socket.id);
        const currentUser = users.get(currentUserId);

        const message = {
            from: currentUserId,
            username: currentUser.username,
            avatar: currentUser.avatar,
            text: text,
            time: new Date().toLocaleTimeString()
        };

        io.emit('new_global_message', message);
    });

    socket.on('disconnect', () => {
        const userId = sessions.get(socket.id);
        sessions.delete(socket.id);
        
        if (userId) {
            io.emit('users_update', Array.from(users.values()).map(u => ({
                id: u.id,
                username: u.username,
                avatar: u.avatar,
                online: Array.from(sessions.values()).includes(u.id)
            })));
        }
    });

    function findSocketByUserId(userId) {
        for (let [socketId, id] of sessions.entries()) {
            if (id === userId) {
                return io.sockets.sockets.get(socketId);
            }
        }
        return null;
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(TalkSpace server running on port ${PORT});
});
