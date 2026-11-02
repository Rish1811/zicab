import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, CheckCircle2, ShieldCheck, ChevronRight, MessageSquare, Car, Briefcase, Wrench, Bus, Users } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    buildDriverOnboardingSessionSnapshot,
    getDriverOnboardingResumeStep,
    getDriverOnboardingSession,
    getStoredDriverRegistrationSession,
    clearDriverRegistrationSession,
    getPoolingDriverOnboardingSession,
    persistDriverAuthSession,
    saveDriverRegistrationSession,
    sendDriverLoginOtp,
    sendDriverOtp,
    startPoolingDriverOnboarding,
    verifyDriverLoginOtp,
    verifyDriverOtp,
    verifyPoolingDriverOnboardingOtp,
} from '../../services/registrationService';
import DriverAuthShell from '../../components/DriverAuthShell';

const unwrap = (response) => response?.data?.data || response?.data || response;
const normalizeDriverRole = (role) => {
    const normalized = String(role || 'driver').toLowerCase();
    if (normalized === 'owner') return 'owner';
    if (normalized === 'pooling_driver' || normalized === 'pooling-driver' || normalized === 'poolingdriver' || normalized === 'pooling') return 'pooling_driver';
    if (normalized === 'service_center' || normalized === 'service-center' || normalized === 'servicecenter') return 'service_center';
    if (normalized === 'service_center_staff' || normalized === 'service-center-staff' || normalized === 'servicecenterstaff') return 'service_center_staff';
    if (normalized === 'bus_driver' || normalized === 'bus-driver' || normalized === 'busdriver') return 'bus_driver';
    return 'driver';
};

const formatRoleLabel = (role) => {
    const normalized = normalizeDriverRole(role);
    if (normalized === 'owner') return 'owner';
    if (normalized === 'bus_driver') return 'bus driver';
    if (normalized === 'pooling_driver') return 'pooling driver';
    if (normalized === 'service_center') return 'service center';
    if (normalized === 'service_center_staff') return 'service center staff';
    return 'driver';
};

const isDriverApproved = (driver) => {
    if (!driver) return false;
    const approval = String(driver?.approve ?? '').toLowerCase();
    const status = String(driver?.status || '').toLowerCase();
    return (
        driver?.approve === true ||
        driver?.approve === 1 ||
        ['true', '1', 'yes', 'approved'].includes(approval) ||
        ['approved', 'active', 'verified'].includes(status)
    );
};

const getPostLoginRoute = (role, driver, routePrefix) => {
    const normalizedRole = normalizeDriverRole(role);
    if (normalizedRole === 'service_center' || normalizedRole === 'service_center_staff') return '/taxi/driver/service-center';
    if (normalizedRole === 'bus_driver') return '/taxi/driver/bus-home';
    if (normalizedRole === 'pooling_driver') return '/taxi/driver/pooling';
    if (normalizedRole === 'owner' || normalizedRole === 'driver') {
        return isDriverApproved(driver)
            ? normalizedRole === 'owner' ? '/taxi/owner/home' : '/taxi/driver/home'
            : `${routePrefix}/registration-status`;
    }
    return '/taxi/driver/home';
};

const syncPushTokens = async () => {
    await Promise.allSettled([
        window.__flushNativeFcmToken?.(),
        window.__registerBrowserFcmToken?.({ interactive: true }),
    ]);
};

const ROLE_DETAILS = {
    driver: {
        title: 'Taxi Driver',
        description: 'Accept taxi rides, view maps, and track earnings.',
        icon: Car,
        color: 'from-amber-400 to-orange-500',
    },
    owner: {
        title: 'Fleet Owner',
        description: 'Manage vehicles, drivers, and fleet earnings.',
        icon: Briefcase,
        color: 'from-blue-500 to-indigo-600',
    },
    service_center: {
        title: 'Service Center',
        description: 'Manage vehicle servicing, slots, and staff.',
        icon: Wrench,
        color: 'from-emerald-400 to-teal-600',
    },
    service_center_staff: {
        title: 'Service Center Staff',
        description: 'Perform vehicle services and inspections.',
        icon: ShieldCheck,
        color: 'from-purple-500 to-pink-600',
    },
    bus_driver: {
        title: 'Bus Driver',
        description: 'View bus routes, schedules, and ticket bookings.',
        icon: Bus,
        color: 'from-cyan-400 to-blue-600',
    },
    pooling_driver: {
        title: 'Pooling Driver',
        description: 'Share rides and manage pooling routes.',
        icon: Users,
        color: 'from-violet-500 to-purple-600',
    },
};

const OTPVerification = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [otp, setOtp] = useState(['', '', '', '']);
    const inputs = useRef([]);
    // The digits as of the last keystroke: fast typing and SMS autofill arrive
    // quicker than React re-renders.
    const latestOtp = useRef(otp);
    latestOtp.current = otp;
    const [timer, setTimer] = useState(60);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [resolvingSession, setResolvingSession] = useState(false);
    const [selectedRole, setSelectedRole] = useState(null);
    const [showRoleSelector, setShowRoleSelector] = useState(false);

    const session = {
        ...getStoredDriverRegistrationSession(),
        ...(location.state || {}),
    };
    const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
    const phone = String(session.phone || '').replace(/\D/g, '').slice(-10);
    const role = session.role || 'driver';
    const roleConfirmed = session.roleConfirmed !== false;
    const registrationId = session.registrationId || '';
    const isLoginFlow = Boolean(session.loginMode);
    const isPoolingOnboardingFlow = Boolean(session.poolingOnboarding);
    const existingAccount = Boolean(session.existingAccount);
    const detectedRole = formatRoleLabel(session.detectedRole || role);
    const entryPath = String(session.entryPath || (isLoginFlow ? `${routePrefix}/login` : `${routePrefix}/reg-phone`));
    const sessionResumeKey = JSON.stringify({
        registrationId,
        phone,
        otpVerified: Boolean(session.otpVerified),
        status: session.status || '',
        fullName: session.fullName || '',
        email: session.email || '',
        gender: session.gender || '',
        locationId: session.locationId || '',
        vehicleTypeId: session.vehicleTypeId || '',
        role: session.role || '',
        roleConfirmed: session.roleConfirmed !== false,
    });

    useEffect(() => {
        let active = true;

        const resumeIfVerified = async () => {
            if (isLoginFlow || !phone || !registrationId) {
                return;
            }

            const locallyVerified = Boolean(session.otpVerified);
            if (locallyVerified) {
                if (isPoolingOnboardingFlow) {
                    navigate('/taxi/driver/pooling/onboarding', {
                        replace: true,
                    });
                    return;
                }
                const nextStep = getDriverOnboardingResumeStep(session);
                navigate(`${routePrefix}/${nextStep}`, {
                    replace: true,
                    state: saveDriverRegistrationSession(session),
                });
                return;
            }

            setResolvingSession(true);
            try {
                const response = isPoolingOnboardingFlow
                    ? await getPoolingDriverOnboardingSession({ registrationId, phone })
                    : await getDriverOnboardingSession({ registrationId, phone });
                const payload = unwrap(response);
                const nextSession = isPoolingOnboardingFlow
                    ? saveDriverRegistrationSession({
                        ...session,
                        registrationId: payload?.session?.registrationId || session.registrationId,
                        phone: payload?.session?.phone || session.phone,
                        role: payload?.session?.role || session.role,
                        status: payload?.session?.status || session.status,
                        otpVerified: Boolean(payload?.session?.otpVerified),
                        fullName: payload?.personal?.fullName || session.fullName || '',
                    })
                    : saveDriverRegistrationSession(
                        buildDriverOnboardingSessionSnapshot(payload, session),
                    );

                if (!active || !nextSession.otpVerified) {
                    return;
                }

                if (isPoolingOnboardingFlow) {
                    navigate('/taxi/driver/pooling/onboarding', {
                        replace: true,
                    });
                    return;
                }

                if (nextSession.roleConfirmed === false) {
                    navigate('/taxi/driver/select-role', {
                        replace: true,
                    });
                    return;
                }

                const nextStep = getDriverOnboardingResumeStep(nextSession);
                navigate(`${routePrefix}/${nextStep}`, {
                    replace: true,
                    state: nextSession,
                });
            } catch (err) {
                const status = Number(err?.status || err?.response?.status || 0);
                if (status === 404 || status === 410) {
                    clearDriverRegistrationSession();
                }
            } finally {
                if (active) {
                    setResolvingSession(false);
                }
            }
        };

        resumeIfVerified();

        return () => {
            active = false;
        };
    }, [isLoginFlow, isPoolingOnboardingFlow, navigate, phone, registrationId, routePrefix, sessionResumeKey]);

    useEffect(() => {
        if (!phone) {
            navigate(entryPath, { replace: true });
            return;
        }
        const interval = setInterval(() => {
            setTimer(prev => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(interval);
    }, [entryPath, navigate, phone]);

    useEffect(() => {
        const focusTimer = window.setTimeout(() => {
            inputs.current[0]?.focus();
        }, 300);
        return () => window.clearTimeout(focusTimer);
    }, []);

    const handleChange = (index, value) => {
        if (!/^\d*$/.test(value)) return;
        const newOtp = [...latestOtp.current];
        // More than one digit in an empty box is a whole code from SMS autofill.
        const incoming = value.length > 1 && !newOtp[index] ? value.slice(0, 4 - index) : value.slice(-1);
        if (incoming) {
            incoming.split('').forEach((digit, offset) => {
                newOtp[index + offset] = digit;
            });
        } else {
            newOtp[index] = '';
        }
        latestOtp.current = newOtp;
        setOtp(newOtp);
        if (incoming && index < 3) {
            inputs.current[Math.min(index + incoming.length, 3)].focus();
        }
        if (newOtp.join('').length === 4) {
            handleVerify(newOtp.join(''));
        }
    };

    const handlePaste = (e) => {
        const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
        if (!digits) return;
        e.preventDefault();
        setOtp(['', '', '', ''].map((_, index) => digits[index] || ''));
        inputs.current[Math.min(digits.length, 3)]?.focus();
        if (digits.length === 4) {
            handleVerify(digits);
        }
    };

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            inputs.current[index - 1].focus();
        }
    };

    const handleVerify = async (otpOverride) => {
        const code = otpOverride || otp.join('');
        if (code.length !== 4) {
            setError('Enter 4-digit code');
            return;
        }

        setLoading(true);
        setError('');

        try {
            if (isLoginFlow) {
                const targetRole = selectedRole || role;
                const queryRole = selectedRole || undefined;
                const response = await verifyDriverLoginOtp({ phone, otp: code, role: queryRole });
                const payload = unwrap(response);

                if (payload?.needsRoleSelection) {
                    saveDriverRegistrationSession({
                        ...session,
                        availableRoles: payload.availableRoles || []
                    });
                    setShowRoleSelector(true);
                    return;
                }

                const loggedInRole = payload?.role || targetRole;
                const token = payload?.token;
                if (!token) {
                    setError('Could not log you in. Please try again.');
                    setOtp(['', '', '', '']);
                    inputs.current[0]?.focus();
                    return;
                }
                persistDriverAuthSession({ token, role: normalizeDriverRole(loggedInRole) });
                await syncPushTokens();
                clearDriverRegistrationSession();
                const normalizedRole = normalizeDriverRole(loggedInRole);
                const nextPath = getPostLoginRoute(normalizedRole, payload?.driver, routePrefix);
                navigate(nextPath, { replace: true });
                return;
            }

            if (isPoolingOnboardingFlow) {
                await verifyPoolingDriverOnboardingOtp({ registrationId, phone, otp: code });
                saveDriverRegistrationSession({
                    ...session,
                    otpVerified: true,
                    status: 'otp_verified',
                });
                navigate('/taxi/driver/pooling/onboarding');
                return;
            }

            const response = await verifyDriverOtp({ registrationId, phone, otp: code });
            const payload = unwrap(response);
            const shouldForceRoleSelection =
                routePrefix === '/taxi/driver'
                && (session.needsRoleSelection === true || session.roleConfirmed === false);
            const nextSession = saveDriverRegistrationSession({
                ...session,
                otpVerified: true,
                role: payload?.session?.role || session.role || 'driver',
                roleConfirmed: shouldForceRoleSelection
                    ? false
                    : (payload?.session?.roleConfirmed ?? session.roleConfirmed ?? true),
                needsRoleSelection: shouldForceRoleSelection,
                status: payload?.session?.status || 'otp_verified',
                otpSession: payload?.session || null,
            });
            if (shouldForceRoleSelection || nextSession.roleConfirmed === false) {
                navigate('/taxi/driver/select-role');
                return;
            }
            navigate(`${routePrefix}/step-personal`);
        } catch (err) {
            setError(err?.message || 'Invalid code');
            setOtp(['', '', '', '']);
            inputs.current[0]?.focus();
        } finally {
            setLoading(false);
        }
    };

    const handleRoleSelect = async (chosenRole) => {
        setSelectedRole(chosenRole);
        setShowRoleSelector(false);
        setLoading(true);
        setError('');

        try {
            const response = await verifyDriverLoginOtp({ phone, otp: otp.join(''), role: chosenRole });
            const payload = unwrap(response);
            const token = payload?.token;
            if (!token) {
                setError('Could not log you in. Please try again.');
                setSelectedRole(null);
                return;
            }
            persistDriverAuthSession({ token, role: normalizeDriverRole(chosenRole) });
            await syncPushTokens();
            clearDriverRegistrationSession();
            const normalizedRole = normalizeDriverRole(chosenRole);
            const nextPath = getPostLoginRoute(normalizedRole, payload?.driver, routePrefix);
            navigate(nextPath, { replace: true });
        } catch (err) {
            setError(err?.message || 'Invalid code');
            setSelectedRole(null);
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (timer > 0) return;
        setLoading(true);
        setError('');
        try {
            const response = isLoginFlow
                ? await sendDriverLoginOtp({ phone, role })
                : isPoolingOnboardingFlow
                    ? await startPoolingDriverOnboarding({ phone })
                    : await sendDriverOtp(roleConfirmed ? { phone, role } : { phone });
            const payload = unwrap(response);
            const nextSession = isLoginFlow
                ? saveDriverRegistrationSession({
                    ...session,
                    phone,
                    role,
                    loginMode: true,
                    entryPath,
                    availableRoles: payload?.availableRoles || payload?.session?.availableRoles || session.availableRoles || [],
                })
                : isPoolingOnboardingFlow
                    ? saveDriverRegistrationSession({
                        ...session,
                        phone,
                        role,
                        loginMode: false,
                        poolingOnboarding: true,
                        registrationId: payload?.session?.registrationId || session.registrationId || '',
                        debugOtp: payload?.session?.debugOtp || '',
                        status: payload?.session?.status || 'otp_sent',
                        entryPath,
                    })
                : saveDriverRegistrationSession(
                    buildDriverOnboardingSessionSnapshot(payload, {
                        ...session,
                        phone,
                        role,
                        entryPath,
                    }),
                );

            setOtp(['', '', '', '']);
            inputs.current[0]?.focus();
            setTimer(60);
            setError(nextSession?.debugOtp ? `Code resent successfully. OTP: ${nextSession.debugOtp}` : 'Code resent successfully');
        } catch (err) {
            setError(err?.message || 'Failed to resend');
        } finally {
            setLoading(false);
        }
    };

    const canVerify = otp.join('').length === 4 && !loading && !resolvingSession;

    return (
        <DriverAuthShell isOwnerPortal={routePrefix === '/taxi/owner'}>
            <button
                type="button"
                onClick={showRoleSelector ? () => setShowRoleSelector(false) : () => navigate(entryPath)}
                className="-ml-2 mb-5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
                <ArrowLeft size={18} />
                Back
            </button>

            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                {showRoleSelector ? 'Choose an account' : 'Enter the code'}
            </h1>
            <p className="mt-2 text-base text-slate-500">
                {showRoleSelector ? (
                    'This number has more than one account.'
                ) : (
                    <>Sent to <span className="font-semibold text-slate-900">+91 {phone}</span></>
                )}
            </p>

            {showRoleSelector ? (
                <div className="mt-8 space-y-3">
                    {(session.availableRoles || []).map((roleKey) => {
                        const roleConfig = ROLE_DETAILS[normalizeDriverRole(roleKey)] || {
                            title: formatRoleLabel(roleKey),
                            description: 'Access your account dashboard.',
                            icon: Car,
                            color: 'from-amber-400 to-orange-500',
                        };
                        const IconComponent = roleConfig.icon;

                        return (
                            <button
                                key={roleKey}
                                type="button"
                                onClick={() => handleRoleSelect(roleKey)}
                                disabled={loading}
                                className="group flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-amber-400 hover:bg-amber-50/40"
                            >
                                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${roleConfig.color} text-white`}>
                                    <IconComponent size={20} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold text-slate-900">{roleConfig.title}</span>
                                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">{roleConfig.description}</span>
                                </span>
                                <ChevronRight size={18} className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                            </button>
                        );
                    })}
                    {error ? (
                        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>
                    ) : null}
                </div>
            ) : (
                <form
                    className="mt-8"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (canVerify) handleVerify();
                    }}
                >
                    {isLoginFlow && existingAccount ? (
                        <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            This number already has a {detectedRole} account, so you'll log in to it.
                        </p>
                    ) : null}

                    <div className="grid grid-cols-4 gap-3">
                        {otp.map((digit, index) => (
                            <input
                                key={index}
                                ref={(el) => { inputs.current[index] = el; }}
                                type="tel"
                                inputMode="numeric"
                                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                                aria-label={`Digit ${index + 1} of 4`}
                                value={digit}
                                onChange={(e) => handleChange(index, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(index, e)}
                                onPaste={handlePaste}
                                className={`h-16 w-full rounded-xl border bg-white text-center text-2xl font-bold text-slate-900 outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-200 ${digit ? 'border-amber-400' : 'border-slate-300'}`}
                            />
                        ))}
                    </div>

                    {error ? (
                        <p
                            role="alert"
                            className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${error.includes('successfully') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
                        >
                            {error}
                        </p>
                    ) : null}

                    <button
                        type="submit"
                        disabled={!canVerify}
                        className={`mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-bold transition-colors ${
                            canVerify ? 'bg-amber-400 text-slate-950 hover:bg-amber-500' : 'cursor-not-allowed bg-slate-100 text-slate-400'
                        }`}
                    >
                        {loading ? (
                            <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-950/20 border-t-slate-950" />
                        ) : (
                            <>
                                Verify and continue
                                <ChevronRight size={20} strokeWidth={2.5} />
                            </>
                        )}
                    </button>

                    <div className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-500">
                        <span>Didn't get it?</span>
                        <button
                            type="button"
                            onClick={handleResend}
                            disabled={timer > 0 || loading}
                            className={`inline-flex items-center gap-1.5 font-semibold ${timer > 0 ? 'cursor-not-allowed text-slate-400' : 'text-amber-700 hover:underline'}`}
                        >
                            <MessageSquare size={14} />
                            {timer > 0 ? `Resend in ${timer}s` : 'Resend code'}
                        </button>
                    </div>
                </form>
            )}
        </DriverAuthShell>
    );
};

export default OTPVerification;
