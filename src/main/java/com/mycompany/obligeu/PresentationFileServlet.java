package com.mycompany.obligeu;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

/** GET /presentation-file?id=N -> downloads the file (any signed-in user). */
@WebServlet("/presentation-file")
public class PresentationFileServlet extends HttpServlet {

    private static String contentType(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".pdf"))  return "application/pdf";
        if (n.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        if (n.endsWith(".ppt"))  return "application/vnd.ms-powerpoint";
        if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (n.endsWith(".doc"))  return "application/msword";
        return "application/octet-stream";
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {

        if (Web.signedInUserId(req) == null) { resp.setStatus(401); return; }

        int id;
        try {
            id = Integer.parseInt(req.getParameter("id"));
        } catch (NumberFormatException e) {
            resp.setStatus(400);
            return;
        }

        String fileName = null;
        String storedName = null;

        try (Connection conn = db.get();
             PreparedStatement ps = conn.prepareStatement(
                     "SELECT file_name, stored_name FROM presentations WHERE id = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    fileName = rs.getString("file_name");
                    storedName = rs.getString("stored_name");
                }
            }
        } catch (SQLException e) {
            e.printStackTrace();
            resp.setStatus(500);
            return;
        }

        if (storedName == null) { resp.setStatus(404); return; }

        Path file = Web.uploadDir().resolve(storedName);
        if (!Files.isRegularFile(file)) { resp.setStatus(404); return; }

        String encoded = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");
        resp.setContentType(contentType(fileName));
        resp.setContentLengthLong(Files.size(file));
        resp.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encoded);
        resp.setHeader("Cache-Control", "private, no-store");
        Files.copy(file, resp.getOutputStream());
    }
}