/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package com.mycompany.obligeu;

/**
 *
 * @author k7ngs
 */
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.mindrot.jbcrypt.BCrypt;

@WebServlet("/login")
public class LoginServlet extends HttpServlet {

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp)
            throws IOException {

        String email = req.getParameter("email");
        String password = req.getParameter("password");

        if (email == null || password == null) {
            resp.setStatus(400);
            return;
        }
        email = email.trim().toLowerCase();

        try (Connection conn = db.get();
             PreparedStatement ps = conn.prepareStatement(
                     "SELECT student_id, firstName, role, password_hash FROM users WHERE email = ?")) {

            ps.setString(1, email);

            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next() && BCrypt.checkpw(password, rs.getString("password_hash"))) {

                    req.getSession().setAttribute("userId", rs.getInt("student_id"));

                    String firstName = rs.getString("firstName")
                            .replace("\\", "\\\\").replace("\"", "\\\"");
                    String role = rs.getString("role");

                    resp.setContentType("application/json");
                    resp.setCharacterEncoding("UTF-8");
                    resp.getWriter().write("{\"firstName\":\"" + firstName + "\",\"role\":"
                            + (role == null ? "null" : "\"" + role + "\"") + "}");
                } else {
                    resp.setStatus(401);
                }
            }

        } catch (SQLException e) {
            e.printStackTrace();
            resp.setStatus(500);
        }
    }
}
