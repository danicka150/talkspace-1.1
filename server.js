import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('.'));

// Простое хранилище в памяти
let users = [];
let messages = [];
let friendRequests = [];

app.get('/', (req, res) => {
    res.sendFile('index.html', { root: '.' });
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Регистрация
    socket.on('register', (data) => {
        if (users.find(u => u.username === data.username)) {
            socket.emit('register_error', 'Имя занято');
            return;
        }

        const user = {
            id: socket.id,
            username: data.username,
            password: data.password, // В реальном приложении хэшируй!
            avatar: https://ui-avatars.com/api/?name=${data.username}&background=667eea&color=fff,
            friends: [],
            online: true
        };

        users.push(user);
        socket.emit('register_success', { user });
        updateOnlineUsers();
    });

    // Вход
    socket.on('login', (data) => {
        const user = users.find(u => u.username === data.username && u.password === data.password);
        if (!user) {
            socket.emit('login_error', 'Неверные данные');
            return;
        }

        user.online = true;
        user.id = socket.id; // Обновляем ID подключения

        const friends = users.filter(u => user.friends.includes(u.username));
        const requests = friendRequests.filter(req => req.to === user.username);

        socket.emit('login_success', { user, friends, requests });
        updateOnlineUsers();
    });

    // Поиск пользователей
    socket.on('search_users', (query) => {
        const currentUser = users.find(u => u.id === socket.id);
        const results = users.filter(u => 
            u.username !== currentUser?.username &&
            !currentUser?.friends.includes(u.username) &&
            u.username.includes(query)
        );
        socket.emit('search_results', results);
    });

    // Заявка в друзья
    socket.on('send_friend_request', (targetUsername) => {
        const currentUser = users.find(u => u.id === socket.id);
        const targetUser = users.find(u => u.username === targetUsername);

        if (!currentUser || !targetUser) return;

        friendRequests.push({
            from: currentUser.username,
            to: targetUser.username
        });

        socket.emit('friend_request_sent');
        
        // Уведомляем получателя если онлайн
        const targetSocket = Object.values(io.sockets.sockets).find(s => 
            users.find(u => u.username === targetUsername)?.id === s.id
        );
        if (targetSocket) {
            targetSocket.emit('new_friend_request', {
                from: currentUser.username,
                fromAvatar: currentUser.avatar
            });
        }
    });

    // Принять заявку
    socket.on('accept_friend_request', (fromUsername) => {
        const currentUser = users.find(u => u.id === socket.id);
        const fromUser = users.find(u => u.username === fromUsername);

        if (currentUser && fromUser) {
            currentUser.friends.push(fromUsername);
            fromUser.friends.push(currentUser.username);
            
            // Удаляем заявку
            friendRequests = friendRequests.filter(req => 
                !(req.from === fromUsername && req.to === currentUser.username)
            );

            socket.emit('friend_added', fromUser);
            updateOnlineUsers();
        }
    });

    // Личные сообщения
    socket.on('private_message', (data) => {
        const currentUser = users.find(u => u.id === socket.id);
        const targetUser = users.find(u => u.username === data.to);

        if (!currentUser || !targetUser) return;
const message = {
            from: currentUser.username,
            to: data.to,
            text: data.text,
            time: new Date().toLocaleTimeString(),
            avatar: currentUser.avatar
        };

        messages.push(message);

        // Отправляем сообщение
        socket.emit('new_private_message', message);
        
        // Отправляем получателю
        const targetSocket = Object.values(io.sockets.sockets).find(s => 
            users.find(u => u.username === data.to)?.id === s.id
        );
        if (targetSocket) {
            targetSocket.emit('new_private_message', message);
        }
    });

    // Общий чат
    socket.on('global_message', (text) => {
        const currentUser = users.find(u => u.id === socket.id);
        if (!currentUser) return;

        const message = {
            from: currentUser.username,
            text: text,
            time: new Date().toLocaleTimeString(),
            avatar: currentUser.avatar
        };

        io.emit('new_global_message', message);
    });

    // Загрузка истории чата
    socket.on('load_chat_history', (friendUsername) => {
        const currentUser = users.find(u => u.id === socket.id);
        const chatMessages = messages.filter(m => 
            (m.from === currentUser.username && m.to === friendUsername) ||
            (m.from === friendUsername && m.to === currentUser.username)
        );
        socket.emit('chat_history', { friendId: friendUsername, messages: chatMessages });
    });

    socket.on('disconnect', () => {
        const user = users.find(u => u.id === socket.id);
        if (user) user.online = false;
        updateOnlineUsers();
    });

    function updateOnlineUsers() {
        io.emit('users_update', users);
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(🚀 Server running on port ${PORT});
});
