package com.mycompany.obligeu;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

/** Small helpers shared by the servlets. */
final class Web {

    private Web() { }

    /** Escapes text so it can sit inside a JSON string. */
    static String esc(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        for (char c : s.toCharArray()) {
            switch (c) {
                case '\\': sb.append("\\\\"); break;
                case '"':  sb.append("\\\""); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.toString();
    }

    /** The signed-in user's id, or null when nobody is signed in. */
    static Integer signedInUserId(HttpServletRequest req) {
        HttpSession session = req.getSession(false);
        if (session == null) return null;
        return (Integer) session.getAttribute("userId");
    }

    /** "student", "organization", or null (checked on the server every time). */
    static String roleOf(Connection conn, int userId) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT role FROM users WHERE student_id = ?")) {
            ps.setInt(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getString("role") : null;
            }
        }
    }

    /**
     * Where uploaded files are kept: a folder called "obligeu-uploads" in the home
     * folder of whoever runs the server. Change this one line to use another folder.
     */
    static Path uploadDir() throws IOException {
        Path dir = Paths.get(System.getProperty("user.home"), "obligeu-uploads");
        Files.createDirectories(dir);
        return dir;
    }
}