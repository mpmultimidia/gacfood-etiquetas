@echo off
title Agente de impressao - Etiquetas
cd /d %~dp0
if not exist node_modules (
  echo Instalando dependencias pela primeira vez...
  call npm install
)
:inicio
node agente.mjs
echo.
echo O agente parou. Reiniciando em 10 segundos... (feche esta janela para sair)
timeout /t 10 >nul
goto inicio
