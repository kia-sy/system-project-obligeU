package com.mycompany.obligeu;

/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */

/**
 *
 * @author k7ngs
 */

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;

@WebServlet("/set-role")
public class RoleServlet extends HttpServlet {
    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp)
            throws IOException {

        HttpSession session = req.getSession(false);
        if (session == null || session.getAttribute("userId") == null) {
            resp.setStatus(401);
            return;
        }

        String role = req.getParameter("role");
        if (!"student".equals(role) && !"organization".equals(role)) {
            resp.setStatus(400);
            return;
        }

        int userId = (int) session.getAttribute("userId");

        try (Connection conn = db.get();    
             PreparedStatement ps = conn.prepareStatement(
                     "UPDATE users SET role = ? WHERE student_id = ?")) {
            ps.setString(1, role);
            ps.setInt(2, userId);
            ps.executeUpdate();
            resp.setStatus(200);
        } catch (SQLException e) {
            e.printStackTrace();
            resp.setStatus(500);
        }
    }
    
}
