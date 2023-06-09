import { Server } from 'socket.io';
import http from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { pubClient, subClient } from '../data/redis';
import { addDeviceToUser, getUserByToken } from '../user/user.service';
import logger from '../logger';
import { renewTokenLife } from '../auth/auth.service';

export let io: Server;

export function init(server: http.Server) {
    io = new Server(server, { path: '/ws' });

    io.adapter(createAdapter(pubClient, subClient));

    io.on('connection', async (socket) => {
        const { deviceId, token, deviceName } = socket.handshake.query;
        logger.debug(`new ws connection deviceId: ${deviceId}`);

        try {
            const user = await getUserByToken(token as string);

            if (!user.devices.find(({ id }) => id === deviceId)) {
                await addDeviceToUser(user.id, { id: deviceId as string, name: deviceName as string });
            }

            logger.info(`ws connection authorized deviceId: ${deviceId} userId: ${user.id}`);

            socket.data = { userId: user.id, deviceId };
            socket.join([user.id, deviceId as string]);

            renewTokenLife(token as string);
        } catch (e) {
            logger.error(`Unable authorize connection deviceId: ${deviceId}`);
            socket.emit('authError', {});
        }
    });
}

export async function getConnectedUserDevicesIds(userId: string): Promise<string[]> {
    const sockets = await io.in(userId).fetchSockets();

    return sockets.map((socket) => socket.data.deviceId);
}

export async function sendCommandToDevice(deviceId: string, commandPayload: any) {
    const sockets = await io.in(deviceId).fetchSockets();
    const socket = sockets[0];

    if (!socket) {
        throw new Error();
    }

    socket.emit('command', commandPayload);
}