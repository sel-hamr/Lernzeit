/*
 * Native modules the app imports that jest-expo does not mock itself. Tests that drive the network
 * pass their own source to the sync triggers instead.
 */
jest.mock('@react-native-community/netinfo', () => jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock.js'))
