@echo off
REM Start het doorgeefluik naar de betaalterminal, zonder venster in de weg.
REM
REM Automatisch laten starten: druk Windows+R, typ  shell:startup  en zet een
REM snelkoppeling naar dit bestand in de map die opengaat. Vanaf de volgende
REM keer inloggen draait hij vanzelf.
REM
REM Vul hieronder ALLE adressen van de Pi in, gescheiden door een spatie.
REM Zolang er een netwerkkabel in de Pi zit heeft hij er twee: die van de kabel
REM en die van zijn eigen access point. Welke hij als afzender kiest is niet aan
REM ons, en een geweigerde verbinding ziet er in de kassa uit als een terminal
REM die stuk is.

set PI_ADRESSEN=10.42.0.1 192.168.1.88

setlocal enabledelayedexpansion
set ALLOW=
for %%A in (%PI_ADRESSEN%) do set ALLOW=!ALLOW! --allow %%A

cd /d "%~dp0"
title Hop ^& Bites - betaalterminal
node relay.mjs %ALLOW%

REM Valt hij om, dan blijft het venster staan zodat je de fout kunt lezen.
echo.
echo Het doorgeefluik is gestopt. Sluit dit venster om het te bevestigen.
pause >nul
