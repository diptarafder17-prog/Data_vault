import java.sql.*;
import java.time.Instant;
import java.util.*;

public class DataVault {

    // ==========================================
    // DATA MODEL RECORD / CLASS
    // ==========================================
    public static class VaultItem {
        private final String key;
        private final String value;
        private final String category;
        private final String createdAt;
        private final String updatedAt;

        public VaultItem(String key, String value, String category, String createdAt, String updatedAt) {
            this.key = key;
            this.value = value;
            this.category = category;
            this.createdAt = createdAt;
            this.updatedAt = updatedAt;
        }

        public String getKey() { return key; }
        public String getValue() { return value; }
        public String getCategory() { return category; }
        public String getCreatedAt() { return createdAt; }
        public String getUpdatedAt() { return updatedAt; }

        @Override
        public String toString() {
            return String.format("[%s] %s: %s", category, key, value);
        }
    }

    // ==========================================
    // CORE ENGINE
    // ==========================================
    private final String dbUrl;

    public DataVault() {
        this("vault.db");
    }

    public DataVault(String dbPath) {
        this.dbUrl = "jdbc:sqlite:" + dbPath;
        initDb();
    }

    private Connection getConnection() throws SQLException {
        return DriverManager.getConnection(dbUrl);
    }

    private void initDb() {
        String createTableSQL = """
            CREATE TABLE IF NOT EXISTS storage (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                category TEXT DEFAULT 'general',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """;
        String createIndexSQL = "CREATE INDEX IF NOT EXISTS idx_category ON storage(category);";

        try (Connection conn = getConnection(); Statement stmt = conn.createStatement()) {
            stmt.execute(createTableSQL);
            stmt.execute(createIndexSQL);
        } catch (SQLException e) {
            throw new RuntimeException("Failed to initialize database: " + e.getMessage(), e);
        }
    }

    /**
     * Stores or updates data (Strings, raw JSON, numbers).
     */
    public boolean set(String key, String value, String category) {
        String now = Instant.now().toString();
        String safeCategory = (category == null || category.isBlank()) ? "general" : category.trim().toLowerCase();

        // Atomic Upsert (SQLite 3.24+)
        String upsertSQL = """
            INSERT INTO storage (key, value, category, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                category = excluded.category,
                updated_at = excluded.updated_at;
        """;

        try (Connection conn = getConnection(); PreparedStatement pstmt = conn.prepareStatement(upsertSQL)) {
            pstmt.setString(1, key);
            pstmt.setString(2, value);
            pstmt.setString(3, safeCategory);
            pstmt.setString(4, now);
            pstmt.setString(5, now);
            pstmt.executeUpdate();
            return true;
        } catch (SQLException e) {
            System.err.println("Error saving record: " + e.getMessage());
            return false;
        }
    }

    /**
     * Retrieve just the stored payload value by key.
     */
    public Optional<String> get(String key) {
        return getMetadata(key).map(VaultItem::getValue);
    }

    /**
     * Retrieve the full record including metadata (timestamps, category).
     */
    public Optional<VaultItem> getMetadata(String key) {
        String query = "SELECT * FROM storage WHERE key = ?";

        try (Connection conn = getConnection(); PreparedStatement pstmt = conn.prepareStatement(query)) {
            pstmt.setString(1, key);
            try (ResultSet rs = pstmt.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapRowToItem(rs));
                }
            }
        } catch (SQLException e) {
            System.err.println("Error retrieving record: " + e.getMessage());
        }
        return Optional.empty();
    }

    /**
     * Delete a record by key.
     */
    public boolean delete(String key) {
        String sql = "DELETE FROM storage WHERE key = ?";

        try (Connection conn = getConnection(); PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setString(1, key);
            return pstmt.executeUpdate() > 0;
        } catch (SQLException e) {
            System.err.println("Error deleting record: " + e.getMessage());
            return false;
        }
    }

    /**
     * Search across keys, categories, and content values.
     */
    public List<VaultItem> search(String query) {
        String sql = """
            SELECT * FROM storage 
            WHERE key LIKE ? OR category LIKE ? OR value LIKE ?
            ORDER BY updated_at DESC
        """;
        List<VaultItem> results = new ArrayList<>();
        String pattern = "%" + query + "%";

        try (Connection conn = getConnection(); PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setString(1, pattern);
            pstmt.setString(2, pattern);
            pstmt.setString(3, pattern);

            try (ResultSet rs = pstmt.executeQuery()) {
                while (rs.next()) {
                    results.add(mapRowToItem(rs));
                }
            }
        } catch (SQLException e) {
            System.err.println("Search failed: " + e.getMessage());
        }
        return results;
    }

    /**
     * List all items (optionally filtered by category).
     */
    public List<VaultItem> listAll(String category) {
        boolean filter = (category != null && !category.isBlank());
        String sql = filter 
            ? "SELECT * FROM storage WHERE category = ? ORDER BY updated_at DESC"
            : "SELECT * FROM storage ORDER BY updated_at DESC";

        List<VaultItem> results = new ArrayList<>();

        try (Connection conn = getConnection(); PreparedStatement pstmt = conn.prepareStatement(sql)) {
            if (filter) {
                pstmt.setString(1, category.trim().toLowerCase());
            }
            try (ResultSet rs = pstmt.executeQuery()) {
                while (rs.next()) {
                    results.add(mapRowToItem(rs));
                }
            }
        } catch (SQLException e) {
            System.err.println("Listing failed: " + e.getMessage());
        }
        return results;
    }

    private VaultItem mapRowToItem(ResultSet rs) throws SQLException {
        return new VaultItem(
            rs.getString("key"),
            rs.getString("value"),
            rs.getString("category"),
            rs.getString("created_at"),
            rs.getString("updated_at")
        );
    }

    // ==========================================
    // INTERACTIVE CLI INTERFACE
    // ==========================================
    public static void main(String[] args) {
        DataVault vault = new DataVault();
        Scanner scanner = new Scanner(System.in);

        System.out.println("=============================================");
        System.out.println("          DATA VAULT STORAGE SYSTEM (JAVA)   ");
        System.out.println("=============================================");

        while (true) {
            System.out.println("\nChoose an action:");
            System.out.println("1. Save Data");
            System.out.println("2. Read Data");
            System.out.println("3. Search Data");
            System.out.println("4. List All Records");
            System.out.println("5. Delete Data");
            System.out.println("6. Exit");

            System.out.print("\nEnter choice [1-6]: ");
            String choice = scanner.nextLine().trim();

            switch (choice) {
                case "1":
                    System.out.print("Enter unique Key: ");
                    String key = scanner.nextLine().trim();
                    System.out.print("Enter Value (string, number, or JSON object): ");
                    String value = scanner.nextLine().trim();
                    System.out.print("Enter Category (press Enter for 'general'): ");
                    String category = scanner.nextLine().trim();

                    if (vault.set(key, value, category)) {
                        System.out.println("-> Successfully saved '" + key + "'.");
                    }
                    break;

                case "2":
                    System.out.print("Enter Key to read: ");
                    String searchKey = scanner.nextLine().trim();
                    Optional<VaultItem> item = vault.getMetadata(searchKey);

                    if (item.isPresent()) {
                        VaultItem v = item.get();
                        System.out.println("\n--- Record Found ---");
                        System.out.println("Key:        " + v.getKey());
                        System.out.println("Category:   " + v.getCategory());
                        System.out.println("Created At: " + v.getCreatedAt());
                        System.out.println("Updated At: " + v.getUpdatedAt());
                        System.out.println("Value:      " + v.getValue());
                    } else {
                        System.out.println("-> Error: Key '" + searchKey + "' not found.");
                    }
                    break;

                case "3":
                    System.out.print("Enter search term: ");
                    String term = scanner.nextLine().trim();
                    List<VaultItem> matches = vault.search(term);
                    System.out.println("\nFound " + matches.size() + " match(es):");
                    for (VaultItem match : matches) {
                        String preview = match.getValue().length() > 50 
                            ? match.getValue().substring(0, 47) + "..." 
                            : match.getValue();
                        System.out.printf("- [%s] %s: %s%n", match.getCategory(), match.getKey(), preview);
                    }
                    break;

                case "4":
                    List<VaultItem> records = vault.listAll(null);
                    System.out.println("\nTotal Records: " + records.size());
                    System.out.printf("%-20s | %-15s | %-25s%n", "KEY", "CATEGORY", "LAST UPDATED");
                    System.out.println("-".repeat(65));
                    for (VaultItem r : records) {
                        System.out.printf("%-20s | %-15s | %-25s%n", r.getKey(), r.getCategory(), r.getUpdatedAt());
                    }
                    break;

                case "5":
                    System.out.print("Enter Key to delete: ");
                    String deleteKey = scanner.nextLine().trim();
                    if (vault.delete(deleteKey)) {
                        System.out.println("-> Successfully deleted '" + deleteKey + "'.");
                    } else {
                        System.out.println("-> Error: Key '" + deleteKey + "' not found.");
                    }
                    break;

                case "6":
                    System.out.println("Exiting DataVault. Goodbye!");
                    scanner.close();
                    return;

                default:
                    System.out.println("Invalid option. Please choose 1-6.");
                    break;
            }
        }
    }
}
