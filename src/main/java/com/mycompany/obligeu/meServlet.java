/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package com.mycompany.obligeu;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

/**
 * Returns the currently logged-in user as JSON, or 401 if nobody is logged in.
 * The pages call this to know who is signed in and which dashboard they belong on.
 */
@WebServlet("/me")
public class meServlet extends HttpServlet {

    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp)
            throws IOException {

        HttpSession session = req.getSession(false);
        if (session == null || session.getAttribute("userId") == null) {
            resp.setStatus(401);
            return;
        }

        int userId = (int) session.getAttribute("userId");

        try (Connection conn = db.get();
             PreparedStatement ps = conn.prepareStatement(
                     "SELECT firstName, lastName, email, role FROM users WHERE student_id = ?")) {

            ps.setInt(1, userId);

            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    resp.setStatus(401);
                    return;
                }

                String role = rs.getString("role");

                resp.setContentType("application/json");
                resp.setCharacterEncoding("UTF-8");
                resp.setHeader("Cache-Control", "no-store");
                resp.getWriter().write("{\"firstName\":\"" + esc(rs.getString("firstName"))
                        + "\",\"lastName\":\"" + esc(rs.getString("lastName"))
                        + "\",\"email\":\"" + esc(rs.getString("email"))
                        + "\",\"role\":" + (role == null ? "null" : "\"" + role + "\"") + "}");
            }

        } catch (SQLException e) {
            e.printStackTrace();
            resp.setStatus(500);
        }
    }
}
