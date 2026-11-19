// jsdom's Blob/File lack arrayBuffer(); use Node's implementations so services behave as in browsers.
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
Object.assign(globalThis, { Blob: NodeBlob, File: NodeFile });
