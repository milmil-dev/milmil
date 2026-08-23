import Foundation
import Security
import Synchronization

/// Where the per-server `mlml_…` token lives. Tokens never expire, so treat
/// them like passwords: Keychain in the app, memory in tests.
public protocol TokenStore: Sendable {
    func token(for profileID: UUID) throws -> String?
    func setToken(_ token: String?, for profileID: UUID) throws
}

public struct KeychainError: Error, Sendable, Equatable {
    public let status: OSStatus
}

public struct KeychainTokenStore: TokenStore {
    private let service: String

    public init(service: String = "dev.milmil.macos.token") {
        self.service = service
    }

    public func token(for profileID: UUID) throws -> String? {
        var query = baseQuery(profileID)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let data = item as? Data else { return nil }
            return String(data: data, encoding: .utf8)
        case errSecItemNotFound:
            return nil
        default:
            throw KeychainError(status: status)
        }
    }

    public func setToken(_ token: String?, for profileID: UUID) throws {
        let query = baseQuery(profileID)
        guard let token else {
            let status = SecItemDelete(query as CFDictionary)
            if status != errSecSuccess, status != errSecItemNotFound { throw KeychainError(status: status) }
            return
        }
        let data = Data(token.utf8)
        let update: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        switch status {
        case errSecSuccess:
            return
        case errSecItemNotFound:
            var add = query
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            let addStatus = SecItemAdd(add as CFDictionary, nil)
            guard addStatus == errSecSuccess else { throw KeychainError(status: addStatus) }
        default:
            throw KeychainError(status: status)
        }
    }

    private func baseQuery(_ profileID: UUID) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: profileID.uuidString,
        ]
    }
}

/// Test double — also handy for previews.
public final class InMemoryTokenStore: TokenStore {
    private let storage = Mutex<[UUID: String]>([:])

    public init() {}

    public func token(for profileID: UUID) throws -> String? {
        storage.withLock { $0[profileID] }
    }

    public func setToken(_ token: String?, for profileID: UUID) throws {
        storage.withLock { $0[profileID] = token }
    }
}
